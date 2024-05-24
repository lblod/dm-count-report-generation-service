import { QueryEngine } from "@comunica/query-sparql";
import { PREFIXES } from "../local-constants.js";
import {
  TemplatedInsert,
  TemplatedUpdate,
} from "../queries/templated-query.js";
import {
  LogLevel,
  ProgressMessage,
  JobStatus,
  JobType,
  UpdateMessage,
  getEnumStringFromUri,
  DataMonitoringFunction,
} from "../types.js";
import { EventEmitter } from "node:events";
import { config } from "../configuration.js";
import { JobTemplate } from "./job-template.js";
import { v4 as uuidv4 } from "uuid";
import { DateTime, now } from "../util/date-time.js";
import Handlebars from "handlebars";
import winston from "winston";
import { Writable } from "node:stream";
import { addToQueue } from "./execution-queue.js";
import { logger } from "../logger.js";

export type JobFunction = (
  progress: JobProgress,
  ...args: any[]
) => Promise<void>;

export type WriteNewJobInput = {
  prefixes: string;
  resourcesUriPrefix: string;
  jobGraphUri: string;
  jobUri: string;
  uuid: string;
  status: JobStatus;
  createdAt: DateTime;
  description: string;
  jobType: JobType;
  datamonitoringFunction: DataMonitoringFunction;
  jobTemplateUri: string;
};

export const insertJobTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{jobUri}}> a cogs:Job, datamonitoring:DatamonitoringJob;
      mu:uuid "{{uuid}}";
      dct:creator <{{resourcesUriPrefix}}job-creator/dm-count-report-generation-service>;
      adms:status {{toJobStatusLiteral status}};
      dct:created {{toDateTimeLiteral createdAt}};
      dct:modified {{toDateTimeLiteral createdAt}};
      task:operation {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
      dct:isPartOf <{{jobTemplateUri}}>;
      datamonitoring:function {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
      datamonitoring:description "{{escape description}}";
      datamonitoring:jobType {{toJobTypeLiteral jobType}}.
  }
} WHERE {

}
`,
  { noEscape: true }
);

export type GetJobsInput = {
  prefixes: string;
  jobGraphUri: string;
  jobStatuses: JobStatus[];
};

export type GetJobsOutput = {
  jobUri: string;
  uuid: string;
  status: JobStatus;
  datamonitoringFunction: DataMonitoringFunction;
  jobType: JobType;
  jobTemplateUri: string;
};

export const getJobTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT * WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?jobUri a cogs:Job, datamonitoring:DatamonitoringJob;
      mu:uuid ?uuid;
      datamonitoring:function ?datamonitoringFunction;
      datamonitoring:taskType ?jobType;
      dct:isPartOf: ?jobTemplateUri.
    {{#each jobStatuses}}
    {
      ?jobUri adms:status {{toJobStatusLiteral this}}.
    }
    {{#unless @last}}UNION{{/unless}}
    {{/each}}
  }
}
`,
  { noEscape: true }
);

export type DeleteBusyJobsInput = {
  prefixes: string;
  jobGraphUri: string;
};

export const deleteBusyJobsTemplate = Handlebars.compile(
  `\
{{prefixes}}
DELETE {
  GRAPH <{{jobGraphUri}}> {
    ?jobUri ?p ?o.
  }
}
WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?jobUri a cogs:Job;
      adms:status {{toJobStatusLiteral "BUSY"}};
      ?p ?o.
  }
}
`,
  { noEscape: true }
);

export type UpdateJobStatusInput = {
  prefixes: string;
  jobGraphUri: string;
  jobUri: string;
  status: JobStatus;
  modifiedAt: DateTime;
};

export const updateJobStatusTemplate = Handlebars.compile(
  `\
{{prefixes}}
DELETE {
  GRAPH <{{jobGraphUri}}> {
    <{{jobUri}}>
      adms:status ?status;
      dct:modified ?modified.
  }
} INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{jobUri}}>
      adms:status {{toJobStatusLiteral status}};
      dct:modified {{toDateTimeLiteral modifiedAt}}.
  }
} WHERE {
  GRAPH <{{jobGraphUri}}> {
    <{{jobUri}}> a cogs:Job,datamonitoring:DatamonitoringJob;
      adms:status ?status;
      dct:modified ?modified.
  }
}
`,
  { noEscape: true }
);

type InfoObject = {
  level: winston.LoggerOptions["level"];
};

/**
 * This classes instances are passed to the invoked job function. Inside of the function body the process
 * can be used to inform listeners about the progress and about updates.
 * At least it can be used as a log function in the job function.
 * This class it not meant to be instantiated. It's instances are only used within a job.
 * TODO refactor so this cannot be instantiated. Anonymous class in Job (static)?
 */
export class JobProgress {
  private _job: Job;
  private _logLevel: LogLevel;
  private _eventEmitter: EventEmitter;
  private _logger: winston.Logger;
  _logBuffer: InfoObject[];
  _done: number | undefined = undefined;
  _total: number | undefined = undefined;

  get logger() {
    return this._logger;
  }

  get eventEmitter() {
    return this._eventEmitter;
  }

  constructor(job: Job, logLevel: LogLevel = "info") {
    this._job = job;
    this._logLevel = logLevel;
    this._eventEmitter = new EventEmitter();
    const newLogBuffer: InfoObject[] = [];
    const newLogWriteStream = new Writable({
      objectMode: true,
      write(winstonObject: InfoObject) {
        newLogBuffer.push(winstonObject);
      },
    });
    this._logger = winston.createLogger({
      level: config.env.LOG_LEVEL,
      format: winston.format.combine(
        winston.format.cli(),
        winston.format.label({ label: `JOB(${this._job.uuid})` })
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.Stream({
          stream: newLogWriteStream,
        }),
      ],
    });
    this._logBuffer = newLogBuffer;
  }

  /**
   * Update listeners about the state of the process
   * @param message The message
   */
  update(message: string) {
    this.logger.log(
      this._logLevel,
      `TASK UPDATE ${getEnumStringFromUri(
        this._job.datamonitoringFunction,
        false
      )}: ${message}`
    );
    const updateMessage: UpdateMessage = {
      timestamp: now().format(),
      message,
    };
    this._eventEmitter.emit(`update`, updateMessage);
  }

  /**
   * Update listeners about progression
   * @param done # Actions completed
   * @param total # Total actions needed doing
   * @param lastDurationMilliseconds # The duration of the last action
   * @param subProcessIdentifier  # Optional string to identify a subprocess of which you report the progress
   */
  progress(
    done: number,
    total: number,
    lastDurationMilliseconds: number | null | undefined = undefined,
    subProcessIdentifier: string | undefined = undefined
  ) {
    this._done = done;
    this._total = total;
    this.logger.log(
      this._logLevel,
      `${
        subProcessIdentifier ? `(${subProcessIdentifier}) ` : ``
      }Progress update ${done}/${total} (${Math.round(
        (done / total) * 100.0
      )}%) ${lastDurationMilliseconds ? ` ${lastDurationMilliseconds} ms` : ``}`
    );
    const progressMessage: ProgressMessage = {
      done,
      total,
      lastDurationMilliseconds,
      subProcessIdentifier,
    };
    this._eventEmitter.emit(`progress`, progressMessage);
  }

  /**
   * Call this at the very end of the job function. It updates the satus of the job and tells listeners the show is over.
   * @param result The end result of the function if applicable. Type checking will be added in the future.
   */
  async return(result: any) {
    this.logger.log(
      this._logLevel,
      `Status change of task ${this._job.uuid} to Finished`
    );
    await this._job.updateStatus(JobStatus.FINISHED);
    const statusMessage = {
      done: true,
      failed: false,
      result,
    };
    this._eventEmitter.emit(`status`, statusMessage);
  }

  /**
   * Call this when an error occurs. It updates the status of the job and tells listeners it has errored out
   * If there is no error handling the job instance should call this for you.
   * @param error
   */
  async error(error: object | number | string | boolean | Error) {
    this.logger.log(
      this._logLevel,
      `Status change of task ${this._job.uuid} to Error`
    );
    await this._job.updateStatus(JobStatus.ERROR);
    const statusMessage = {
      done: true,
      failed: true,
      error,
    };
    this._eventEmitter.emit(`status`, statusMessage);
  }

  /**
   * Should be called only once per job and never by the user. Job instances call this.
   */
  async start() {
    this.logger.log(
      this._logLevel,
      `Status change of task ${this._job.uuid} to Busy`
    );
    await this._job.updateStatus(JobStatus.BUSY);
    const statusMessage = {
      done: false,
      failed: false,
    };
    this._eventEmitter.emit(`status`, statusMessage);
  }
}

export class Job {
  _progress: JobProgress;
  private _insertQuery: TemplatedInsert<WriteNewJobInput>;
  private _updateStatusQuery: TemplatedInsert<UpdateJobStatusInput>;
  private _graphUri: string;
  private _jobTemplate: JobTemplate;
  private _jobType: JobType;
  private _uuid: string;
  private _status: JobStatus;
  private _createdAt: DateTime;
  private _modifiedAt: DateTime;

  get createdAt() {
    return this._createdAt;
  }
  get modifiedAt() {
    return this._modifiedAt;
  }
  get status(): JobStatus {
    return this._status;
  }
  get uuid() {
    return this._uuid;
  }
  get taskType() {
    return this._jobType;
  }

  get datamonitoringFunction() {
    return this._jobTemplate.datamonitoringFunction;
  }

  get jobTemplateUri() {
    return this._jobTemplate.uri;
  }

  get eventEmitter() {
    return this._progress.eventEmitter;
  }

  get progressTotal() {
    return this._progress._total;
  }

  get progressDone() {
    return this._progress._done;
  }

  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    jobType: JobType,
    graphUri: string,
    uuid: string,
    initialStatus: JobStatus,
    job: JobTemplate
  ) {
    if (jobType === JobType.PARALLEL) {
      throw new Error("Parallel type tasks not supported yet");
    }
    this._insertQuery = new TemplatedInsert<WriteNewJobInput>(
      queryEngine,
      endpoint,
      insertJobTemplate
    );
    this._updateStatusQuery = new TemplatedInsert<UpdateJobStatusInput>(
      queryEngine,
      endpoint,
      updateJobStatusTemplate
    );
    this._jobType = jobType;
    this._graphUri = graphUri;
    this._jobTemplate = job;
    this._uuid = uuid;
    this._status = initialStatus;
    this._progress = new JobProgress(this, "verbose");
    const n = now();
    this._createdAt = n;
    this._modifiedAt = n;
  }

  get uri() {
    return `${config.env.URI_PREFIX_RESOURCES}job/${this._uuid}`;
  }

  logs() {
    return [...this._progress._logBuffer];
  }

  logsAsStrings() {
    return this._progress._logBuffer.map((ob) => JSON.stringify(ob)); // TODO. Use cli formatting
  }

  async execute(...args: any[]) {
    if (this._jobType === JobType.PARALLEL)
      throw new Error(`Parallel tasks not supported yet`);
    if (this.status === JobStatus.NOT_STARTED)
      throw new Error("Job already started or finished.");

    const waiting = addToQueue(this, ...args); // Returns immediately and gives the number of tasks waiting in the queue
    const message = waiting
      ? `Job queued with uuid "${this.uuid}". ${waiting} jobs in the queue before this one.`
      : `Job queued with uuid "${this.uuid}" queued. No jobs in the queue. Executing directly.`;
    this._progress.update(message);
    logger.info(message);
  }

  async updateStatus(status: JobStatus) {
    if (this.status === status) return;
    const n = now();
    await this._updateStatusQuery.execute({
      prefixes: PREFIXES,
      modifiedAt: n,
      status,
      jobGraphUri: config.env.JOB_GRAPH_URI,
      jobUri: this.uri,
    });
    this._status = status;
    this._modifiedAt = n;
  }

  async _createNewResource() {
    await this._insertQuery.execute({
      prefixes: PREFIXES,
      resourcesUriPrefix: config.env.URI_PREFIX_RESOURCES,
      uuid: this._uuid,
      jobGraphUri: this._graphUri,
      jobUri: this.uri,
      status: this._status,
      createdAt: this._createdAt,
      description: `Job created by dm-count-report-generation-service of job template with uri "${this.jobTemplateUri}".`,
      jobType: this._jobType,
      jobTemplateUri: this.jobTemplateUri,
      datamonitoringFunction: this.datamonitoringFunction,
    });
  }
}

type DefaultJobCreationSettings = {
  queryEngine: QueryEngine;
  endpoint: string;
};

let defaults: DefaultJobCreationSettings | undefined = undefined;

const jobs = new Map<string, Job>();

export function getJobs(): Job[] {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setTaskCreeationDefaults' first from the task module.`
    );
  return [...jobs.values()];
}

export function getJob(uri: string): Job | undefined {
  return jobs.get(uri);
}

export function setJobCreationDefaults(
  queryEngine: QueryEngine,
  endpoint: string
) {
  defaults = {
    queryEngine,
    endpoint,
  };
}

export async function createJob(
  jobTemplate: JobTemplate,
  jobType: JobType.SERIAL,
  initialStatus = JobStatus.NOT_STARTED
): Promise<Job> {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setTaskCreeationDefaults' first from the task module.`
    );
  const newJob = new Job(
    defaults.queryEngine,
    defaults.endpoint,
    jobType,
    config.env.JOB_GRAPH_URI,
    uuidv4(),
    initialStatus,
    jobTemplate
  );
  await newJob._createNewResource();
  jobs.set(newJob.uri, newJob);
  return newJob;
}

// TODO: Make sure we don't delete a job with an async function running
export async function deleteBusyJobs() {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const deleteBusyJobsQuery = new TemplatedUpdate<DeleteBusyJobsInput>(
    defaults.queryEngine,
    defaults.endpoint,
    deleteBusyJobsTemplate
  );
  await deleteBusyJobsQuery.execute({
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
  });
}

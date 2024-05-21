import { QueryEngine } from "@comunica/query-sparql";
import { PREFIXES } from "../local-constants.js";
import { logger } from "../logger.js";
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
import { longDuration } from "../util/util.js";
import { JOB_FUNCTIONS } from "./job-functions-map.js";
import { JobTemplate } from "./job-template.js";
import { v4 as uuidv4 } from "uuid";
import { DateTime, now } from "../util/date-time.js";

export type JobFunction = (
  progress: JobProgress,
  ...args: any[]
) => Promise<void>;

export type WriteNewJobInput = {
  prefixes: string;
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
      dct:creator <https://codifly.be/ns/resources/task-creator/dm-count-report-generation-service>;
      adms:status {{toJobStatusLiteral status}};
      dct:created {{toDateTimeLiteral createdAt}};
      dct:modified {{toDateTimeLiteral createdAt}};
      task:operation {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
      dct:isPartOf <{{jobTemplateUri}}>;
      datamonitoring:function {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
      datamonitoring:description "{{description}}";
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
      adms:status {{(toJobStatusLiteral "BUSY")}};
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
    <{{jobUri}}
      adms:status ?status;
      dct:modified ?modified.
  }
} INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{jobUri}}>
      adms:status {{toTaskStatusLiteral status}};
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

  get eventEmitter() {
    return this._eventEmitter;
  }

  constructor(job: Job, logLevel: LogLevel = "info") {
    this._job = job;
    this._logLevel = logLevel;
    this._eventEmitter = new EventEmitter();
  }

  /**
   * Update listeners about the state of the process
   * @param message The message
   */
  update(message: string) {
    logger.log(
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
    logger.log(
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
    logger.log(
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
    logger.log(
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
    logger.log(
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
  private _progress: JobProgress;
  private _insertQuery: TemplatedInsert<WriteNewJobInput>;
  private _updateStatusQuery: TemplatedInsert<UpdateJobStatusInput>;
  private _graphUri: string;
  private _jobTemplate: JobTemplate;
  private _jobType: JobType;
  private _uuid: string;
  private _status: JobStatus;
  private _promises: Promise<any>[] = [];
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
    return `http://codifly.be/namespaces/job/${this._uuid}`;
  }

  async execute(...args: any[]) {
    // TODO. Support parallel tasks later
    if (this._promises.length) {
      throw new Error("Already executing. Parallel tasks not supported yet.");
    }
    if (this._jobType === JobType.PARALLEL)
      throw new Error(`Parallel tasks not supported yet`);

    await this._progress.start();
    // We do not await. We keep the promise because this is a very, very long running task.
    const promise = longDuration(
      JOB_FUNCTIONS[this.datamonitoringFunction],
      "verbose"
    )(this._progress, ...args);
    this._promises.push(promise);
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

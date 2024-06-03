import { QueryEngine } from "@comunica/query-sparql";
import { PREFIXES } from "../local-constants.js";
import {
  TemplatedInsert,
  TemplatedSelect,
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
  StatusMessage,
} from "../types.js";
import { EventEmitter } from "node:events";
import { config } from "../configuration.js";
import { JobTemplate, getJobTemplate } from "./job-template.js";
import { v4 as uuidv4 } from "uuid";
import { DateTime, now } from "../util/date-time.js";
import Handlebars from "handlebars";
import winston from "winston";
import { addToQueue } from "./execution-queue.js";
import { logger } from "../logger.js";
import { queryEngine } from "../queries/query-engine.js";

export type JobFunction = (
  progress: JobProgress,
  ...args: any[]
) => Promise<void>;

type WriteNewJobInput = {
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

const insertJobTemplate = Handlebars.compile(
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

type DeleteJobsInput = {
  prefixes: string;
  jobGraphUri: string;
  jobStatuses: JobStatus[] | null; // Null will delete all jobs
};

const deleteJobsTemplate = Handlebars.compile(
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
      ?p ?o.
    {{#if (listPopulated jobStatuses)}}{{#each jobStatuses}}
    {
      ?jobUri adms:status {{toJobStatusLiteral this}}.
    }
    {{#unless @last}}UNION{{/unless}}
    {{/each}}{{/if}}
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
  _logBuffer: { timestamp: DateTime; message: string }[];
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
    const newLogBuffer: { timestamp: DateTime; message: string }[] = [];
    this._logger = winston.createLogger({
      level: config.env.LOG_LEVEL,
      format: winston.format.combine(winston.format.cli()),
      transports: [new winston.transports.Console()],
    });
    this._logBuffer = newLogBuffer;
  }

  private addToLogBuffer(message: string) {
    this._logBuffer.push({
      timestamp: now(),
      message,
    });
  }

  /**
   * Update listeners about the state of the process
   * @param message The message
   */
  update(message: string) {
    this.logger.log(
      this._logLevel,
      `JOB UPDATE ${getEnumStringFromUri(
        this._job.datamonitoringFunction,
        false
      )}: ${message}`
    );
    const updateMessage: UpdateMessage = {
      timestamp: now().format(),
      message,
    };
    this.addToLogBuffer(message);
    this._eventEmitter.emit(`update`, updateMessage);
  }

  /**
   * Update listeners about progression. Will send a progress message and an update message
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

    const logMessage = `${done}/${total} (${Math.round(
      (done / total) * 100.0
    )}%) ${lastDurationMilliseconds ? ` ${lastDurationMilliseconds} ms` : ``}`;

    this.logger.log(
      this._logLevel,
      `JOB PROGRESS ${getEnumStringFromUri(
        this._job.datamonitoringFunction,
        false
      )}: ${logMessage}`
    );

    const updateMessage: UpdateMessage = {
      timestamp: now().format(),
      message: logMessage,
    };

    this.addToLogBuffer(logMessage);

    const progressMessage: ProgressMessage = {
      done,
      total,
      lastDurationMilliseconds,
      subProcessIdentifier,
    };
    this._eventEmitter.emit(`progress`, progressMessage);
    this._eventEmitter.emit(`update`, updateMessage);
  }

  /**
   * Call this at the very end of the job function. It updates the satus of the job and tells listeners the show is over.
   * @param result The end result of the function if applicable. Type checking will be added in the future.
   */
  async return(result: any) {
    const message = `Status change of job ${this._job.uuid} to Finished`;
    this.logger.log(this._logLevel, message);
    await this._job.updateStatus(JobStatus.FINISHED);
    const statusMessage: StatusMessage = {
      done: true,
      failed: false,
      result,
      newStatusKey: "FINISHED",
    };
    this.addToLogBuffer(message);
    this._eventEmitter.emit(`status`, statusMessage);
    const updateMessage: UpdateMessage = {
      timestamp: now().format(),
      message,
    };
    this._eventEmitter.emit(`update`, updateMessage);
  }

  /**
   * Call this when an error occurs. It updates the status of the job and tells listeners it has errored out.
   * It will also send an update.
   * If there is no error handling the execution queue should call this for you.
   * @param error
   */
  async error(error: object | number | string | boolean | Error) {
    const message = `Status change of job ${this._job.uuid} to Error`;
    this.logger.log(this._logLevel, message);
    await this._job.updateStatus(JobStatus.ERROR);
    const statusMessage: StatusMessage = {
      done: true,
      failed: true,
      error,
      newStatusKey: "ERROR",
    };
    this.addToLogBuffer(message);
    this._eventEmitter.emit(`status`, statusMessage);
    const updateMessage: UpdateMessage = {
      timestamp: now().format(),
      message,
    };
    this._eventEmitter.emit(`update`, updateMessage);
  }

  /**
   * Should be called only once per job and never by the user. Job instances call this.
   */
  async start() {
    const message = `Status change of job ${this._job.uuid} to Busy`;
    this.logger.log(this._logLevel, message);
    await this._job.updateStatus(JobStatus.BUSY);
    const statusMessage: StatusMessage = {
      done: false,
      failed: false,
      newStatusKey: "BUSY",
    };
    this.addToLogBuffer(message);
    this._eventEmitter.emit(`status`, statusMessage);
    const updateMessage: UpdateMessage = {
      timestamp: now().format(),
      message,
    };
    this._eventEmitter.emit(`update`, updateMessage);
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
  get jobType() {
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
    return this.logsAsStrings().join("\n");
  }

  logsAsStrings() {
    return this._progress._logBuffer.map(
      (r) => `${r.timestamp.format()}: ${r.message}`
    );
  }

  async execute(...args: any[]) {
    if (this._jobType === JobType.PARALLEL)
      throw new Error(`Parallel tasks not supported yet`);
    if (this.status !== JobStatus.NOT_STARTED)
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

export function unloadJob(uri: string): boolean {
  return jobs.delete(uri);
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
export async function deleteJobs(jobStatuses: JobStatus[] | null = null) {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  if ((jobStatuses && jobStatuses.includes(JobStatus.BUSY)) || !jobStatuses)
    logger.warn(
      "Removing BUSY tasks at runtime. Be careful. They may still be running."
    );
  if (jobStatuses === null) {
    // We purge everything
    jobs.clear();
  } else {
    for (const job of jobs.values()) jobs.delete(job.uri); // Make sure that whatever we kill the reference is released.
  }
  const deleteJobsQuery = new TemplatedUpdate<DeleteJobsInput>(
    defaults.queryEngine,
    defaults.endpoint,
    deleteJobsTemplate
  );
  await deleteJobsQuery.execute({
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
    jobStatuses,
  });
}

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

const getJobQueryTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT * WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?jobUri a cogs:Job, datamonitoring:DatamonitoringJob;
      mu:uuid ?uuid;
      datamonitoring:function ?datamonitoringFunction;
      datamonitoring:jobType ?jobType;
      dct:isPartOf ?jobTemplateUri;
      adms:status ?status.
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

/**
 * Call this function at startup. It loads the jobs with status not started and busy.
 * Jobs are not meant to have the status NOT_STARTED and BUSY for long.
 * When jobs have the status NOT_STARTED at startup it means they were waiting in the execution queue but not executing when the service stopped. They will be re added.
 * When jobs have the status BUSY at startup it means they were executing when the service quit. Because their operation was halted and the associated state was lost the work cannot be recuperated and its status needs to be changed to error.
 */
export async function loadJobs() {
  const loadJobQuery = new TemplatedSelect<GetJobsInput, GetJobsOutput>(
    queryEngine,
    config.env.REPORT_ENDPOINT,
    getJobQueryTemplate
  );
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const jobRecords = await loadJobQuery.objects("jobUri", {
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
    jobStatuses: [JobStatus.NOT_STARTED, JobStatus.BUSY],
  });
  const bins = {
    queued: [] as Job[],
    errored: [] as Job[],
  };
  for (const record of jobRecords) {
    const jt = getJobTemplate(record.jobTemplateUri);
    if (!jt)
      throw new Error(
        `Job was loaded from the database but the associated job template with URI "${record.jobTemplateUri}" was not found. That is impossible.`
      );
    if (record.jobType !== JobType.SERIAL)
      throw new Error(`Other job types than SERIAL are not supported yet.`);
    const newJob = new Job(
      defaults.queryEngine,
      defaults.endpoint,
      record.jobType,
      config.env.JOB_GRAPH_URI,
      record.uuid,
      record.status,
      jt
    );

    // If the job has NOT started then it needs to be added to the queue for executuon.
    // This means that the service was shut down while there were still jobs in the queue. Re add them.
    if (record.status === JobStatus.NOT_STARTED) {
      addToQueue(newJob);
      bins.queued.push(newJob);
      jobs.set(newJob.uri, newJob);
    }
    // If the job is busy on service statup it means the service was stopped before the job was finished
    // We need to change the status of these jobs to error because the serivice quit prematurely
    if (record.status === JobStatus.BUSY) {
      await newJob.updateStatus(JobStatus.ERROR);
      bins.errored.push(newJob);
      unloadJob(newJob.uri); // We don't keep error jobs in memory.
    }
  }
  if (bins.errored.length || bins.queued.length) {
    logger.verbose(
      `Jobs loaded but the service may have shut down incorectly. Re added ${bins.queued.length} jobs to the execution queue and ${bins.errored.length} jobs had to have their status changed to ERROR because the service was interrupted before the operation could finish.`
    );
  }
  return bins;
}

import { QueryEngine } from "@comunica/query-sparql";
import { config } from "../configuration.js";
import { TimeOnly } from "../util/date-time.js";
import dayjs from "dayjs";
import { PREFIXES } from "../local-constants.js";
import {
  DeleteAllJobsInput,
  GetJobsInput,
  GetPeriodicJobsOutput,
  GetRestJobsOutput,
  UpdateJobStatusInput,
  WriteNewPeriodicJobInput,
  WriteNewRestJobInput,
  deleteAllJobsTemplate,
  getPeriodicJobsTemplate,
  getRestJobsTemplate,
  insertPeriodicJobTemplate,
  insertRestJobTemplate,
  updateJobStatusTemplate,
} from "../queries/queries.js";
import {
  TemplatedInsert,
  TemplatedSelect,
  TemplatedUpdate,
} from "../queries/templated-query.js";
import {
  DataMonitoringFunction,
  DayOfWeek,
  JobStatus,
  JobType,
  TaskStatus,
  TaskType,
  getEnumStringFromUri,
} from "../types.js";
import { v4 as uuidv4 } from "uuid";
import { createTask } from "./task.js";
import { retry } from "util/util.js";

export class Job {
  _updateStatusQuery: TemplatedInsert<UpdateJobStatusInput>;
  _graphUri: string;
  _jobType: JobType;
  _uuid: string;
  _status: JobStatus;
  get status() {
    return this._status;
  }
  _datamonitoringFunction: DataMonitoringFunction;
  get datamonitoringFunction() {
    return this._datamonitoringFunction;
  }
  get uuid() {
    return this._uuid;
  }
  get jobType() {
    return this._jobType;
  }

  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    jobType: JobType,
    graphUri: string,
    uuid: string,
    initialStatus: JobStatus,
    datamonitoringFunction: DataMonitoringFunction
  ) {
    this._updateStatusQuery = new TemplatedInsert<UpdateJobStatusInput>(
      queryEngine,
      endpoint,
      updateJobStatusTemplate
    );
    this._jobType = jobType;
    this._graphUri = graphUri;
    this._uuid = uuid;
    this._status = initialStatus;
    this._datamonitoringFunction = datamonitoringFunction;
  }

  get uri() {
    return `http://codifly.be/namespaces/job/${this._uuid}`;
  }

  async updateStatus(status: JobStatus) {
    await this._updateStatusQuery.execute({
      prefixes: PREFIXES,
      modifiedAt: dayjs(),
      status,
      jobGraphUri: this._graphUri,
      jobUri: this.uri,
    });
    this._status = status;
  }

  async invoke(...args: any[]) {
    const task = await createTask(this, TaskType.SERIAL, TaskStatus.BUSY);
    await task.execute(...args);
    return task;
  }

  toString() {
    return `JOB(${this.uri}) with status: ${getEnumStringFromUri(
      this.status,
      false
    )} and type ${getEnumStringFromUri(this.jobType, false)}`;
  }
}

export class PeriodicJob extends Job {
  _insertQuery: TemplatedInsert<WriteNewPeriodicJobInput>;
  _timeOfInvocation: TimeOnly;
  get timeOfInvocation() {
    return this._timeOfInvocation;
  }
  _daysOfInvocation: DayOfWeek[];
  get daysOfInvocation() {
    return this._daysOfInvocation;
  }
  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    graphUri: string,
    uuid: string,
    initialStatus: JobStatus,
    datamonitoringFunction: DataMonitoringFunction,
    timeOfInvocation: TimeOnly,
    daysOfInvocation: DayOfWeek[]
  ) {
    super(
      queryEngine,
      endpoint,
      JobType.PERIODIC,
      graphUri,
      uuid,
      initialStatus,
      datamonitoringFunction
    );
    this._timeOfInvocation = timeOfInvocation;
    this._daysOfInvocation = daysOfInvocation;
    this._insertQuery = new TemplatedInsert<WriteNewPeriodicJobInput>(
      queryEngine,
      endpoint,
      insertPeriodicJobTemplate
    );
  }

  async _createNewResource() {
    await this._insertQuery.execute({
      prefixes: PREFIXES,
      uuid: this._uuid,
      jobGraphUri: this._graphUri,
      newJobUri: this.uri,
      status: this._status,
      createdAt: dayjs(),
      description: `Job created by dm-count-report-generation-service`,
      jobType: JobType.PERIODIC,
      timeOfInvocation: this._timeOfInvocation,
      daysOfInvocation: this._daysOfInvocation,
      datamonitoringFunction: this._datamonitoringFunction,
    });
  }
  override toString(): string {
    return `${super.toString()}\n\tPeriodic job with invocation on: ${this.timeOfInvocation.toString()} on ${this.daysOfInvocation
      .map((day) => getEnumStringFromUri(day, true))
      .join(", ")}`;
  }
}

export class RestJob extends Job {
  _insertQuery: TemplatedInsert<WriteNewRestJobInput>;
  _restPath: string;
  get restPath() {
    return this._restPath;
  }
  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    graphUri: string,
    uuid: string,
    initialStatus: JobStatus,
    datamonitoringFunction: DataMonitoringFunction,
    restPath: string
  ) {
    super(
      queryEngine,
      endpoint,
      JobType.REST_INVOKED,
      graphUri,
      uuid,
      initialStatus,
      datamonitoringFunction
    );
    (this._restPath = restPath),
      (this._insertQuery = new TemplatedInsert<WriteNewRestJobInput>(
        queryEngine,
        endpoint,
        insertRestJobTemplate
      ));
  }

  async _createNewResource() {
    await this._insertQuery.execute({
      prefixes: PREFIXES,
      uuid: this._uuid,
      jobGraphUri: this._graphUri,
      newJobUri: this.uri,
      status: this._status,
      createdAt: dayjs(),
      description: `Job created by dm-count-report-generation-service`,
      jobType: JobType.REST_INVOKED,
      restPath: this._restPath,
      datamonitoringFunction: this._datamonitoringFunction,
    });
  }

  override toString(): string {
    return `${super.toString()}\n\tRest job with activated by HTTP using path "/${
      this.restPath
    }"`;
  }
}

type DefaultJobCreationSettings = {
  queryEngine: QueryEngine;
  endpoint: string;
};

let defaults: DefaultJobCreationSettings | undefined = undefined;

const jobs = new Map<string, Job>();

/**
 * Gets you a deep copy of the jobs array. Modifying it is no use. Use the other methods in the module to manipulate jobs
 * @returns An array of jobs
 */
export function getJobs(): Job[] {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  return [...jobs.values()];
}

export function getJob(uri: string): Job | undefined {
  return jobs.get(uri);
}

export function setJobCreeationDefaults(
  queryEngine: QueryEngine,
  endpoint: string
) {
  defaults = {
    queryEngine,
    endpoint,
  };
}

export async function createPeriodicJob(
  datamonitoringFunction: DataMonitoringFunction,
  timeOfInvocation: TimeOnly,
  daysOfInvocation: DayOfWeek[],
  initialStatus = JobStatus.NOT_STARTED
): Promise<PeriodicJob> {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const newJob = new PeriodicJob(
    defaults.queryEngine,
    defaults.endpoint,
    config.env.JOB_GRAPH_URI,
    uuidv4(),
    initialStatus,
    datamonitoringFunction,
    timeOfInvocation,
    daysOfInvocation
  );
  await newJob._createNewResource();
  jobs.set(newJob.uri, newJob);
  return newJob;
}
export async function createRestJob(
  datamonitoringFunction: DataMonitoringFunction,
  restPath: string,
  initialStatus = JobStatus.NOT_STARTED
): Promise<RestJob> {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const newJob = new RestJob(
    defaults.queryEngine,
    defaults.endpoint,
    config.env.JOB_GRAPH_URI,
    uuidv4(),
    initialStatus,
    datamonitoringFunction,
    restPath
  );
  await newJob._createNewResource();
  jobs.set(newJob.uri, newJob);
  return newJob;
}

export async function loadJobs() {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const getPeriodicJobsQuery = new TemplatedSelect<
    GetJobsInput,
    GetPeriodicJobsOutput
  >(defaults.queryEngine, defaults.endpoint, getPeriodicJobsTemplate);
  const getRestJobsQuery = new TemplatedSelect<GetJobsInput, GetRestJobsOutput>(
    defaults.queryEngine,
    defaults.endpoint,
    getRestJobsTemplate
  );
  const periodicJobRecords = await getPeriodicJobsQuery.objects("jobUri", {
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
  });
  for (const record of periodicJobRecords) {
    const newJob = new PeriodicJob(
      defaults.queryEngine,
      defaults.endpoint,
      config.env.JOB_GRAPH_URI,
      record.uuid,
      record.status,
      record.datamonitoringFunction,
      record.timeOfInvocation,
      record.daysOfInvocation
    );
    jobs.set(newJob.uri, newJob);
  }
  const restJobRecords = await retry(
    getRestJobsQuery.objects.bind(getRestJobsQuery)
  )("jobUri", {
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
  });
  for (const record of restJobRecords.result) {
    const newJob = new RestJob(
      defaults.queryEngine,
      defaults.endpoint,
      config.env.JOB_GRAPH_URI,
      record.uuid,
      record.status,
      record.datamonitoringFunction,
      record.restPath
    );
    jobs.set(newJob.uri, newJob);
  }
}

export async function deleteAllJobs() {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const deleteAllJobsQuery = new TemplatedUpdate<DeleteAllJobsInput>(
    defaults.queryEngine,
    defaults.endpoint,
    deleteAllJobsTemplate
  );
  await retry(deleteAllJobsQuery.execute)({
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
  });
  jobs.clear(); // Release references
}

let debugJob: Job | null = null;

export function setDebugJob(job: Job) {
  debugJob = job;
}

export function getDebugJob(): Job {
  if (config.env.DISABLE_DEBUG_ENDPOINT)
    throw new Error(
      `Cannot get debug job if debug endpoints have been disabled`
    );
  if (!debugJob) throw new Error(`Application was not initialised correctly`);
  return debugJob;
}

import { QueryEngine } from "@comunica/query-sparql";
import { config } from "configuration.js";
import { TimeOnly } from "date-util.js";
import dayjs from "dayjs";
import { PREFIXES } from "local-constants.js";
import {
  GetJobsInput,
  GetJobsOutput,
  UpdateJobStatusInput,
  WriteNewJobInput,
  getJobsTemplate,
  insertJobTemplate,
  updateJobStatusTemplate,
} from "queries/queries.js";
import { TemplatedInsert, TemplatedSelect } from "queries/templated-query.js";
import {
  DataMonitoringFunction,
  DayOfWeek,
  JobStatus,
  JobType,
} from "types.js";
import { v4 as uuidv4 } from "uuid";

class Job {
  _updateStatusQuery: TemplatedInsert<UpdateJobStatusInput>;
  _graphUri: string;
  _jobType: JobType;
  _uuid: string;
  _status: JobStatus;
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
}

class PeriodicJob extends Job {
  _insertQuery: TemplatedInsert<WriteNewJobInput>;
  _timeOfInvocation: TimeOnly;
  _daysOfInvocation: DayOfWeek[];
  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    jobType: JobType,
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
      jobType,
      graphUri,
      uuid,
      initialStatus,
      datamonitoringFunction
    );
    this._timeOfInvocation = timeOfInvocation;
    this._daysOfInvocation = daysOfInvocation;
    this._insertQuery = new TemplatedInsert<WriteNewJobInput>(
      queryEngine,
      endpoint,
      insertJobTemplate
    );
  }

  async _createNewResource() {
    await this._insertQuery.execute({
      prefixes: PREFIXES,
      jobGraphUri: this._graphUri,
      newJobUri: this.uri,
      status: this._status,
      createdAt: dayjs(),
      description: `Job created by dm-count-report-generation-service`,
      jobType: this._jobType,
      timeOfInvocation: this._timeOfInvocation,
      daysOfInvocation: this._daysOfInvocation,
      datamonitoringFunction: this._datamonitoringFunction,
    });
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
    JobType.PERIODIC,
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

export async function loadJobs() {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const getJobsQuery = new TemplatedSelect<GetJobsInput, GetJobsOutput>(
    defaults.queryEngine,
    defaults.endpoint,
    getJobsTemplate
  );
  const jobRecords = await getJobsQuery.objects("jobUri", {
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
  });
  for (const record of jobRecords) {
    const newJob = (() => {
      switch (record.jobType) {
        case JobType.PERIODIC:
          return new PeriodicJob(
            defaults.queryEngine,
            defaults.endpoint,
            JobType.PERIODIC,
            config.env.JOB_GRAPH_URI,
            record.uuid,
            record.status,
            record.datamonitoringFunction,
            record.timeOfInvocation,
            record.daysOfInvocation
          );
        case JobType.ONCE:
          throw new Error("Not implemented yet");
      }
    })();
    jobs.set(newJob.uri, newJob);
  }
}

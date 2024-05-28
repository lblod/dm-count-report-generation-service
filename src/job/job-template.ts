import { QueryEngine } from "@comunica/query-sparql";
import { config } from "../configuration.js";
import { DateTime, TimeOnly, now } from "../util/date-time.js";
import { PREFIXES } from "../local-constants.js";
import {
  TemplatedInsert,
  TemplatedSelect,
  TemplatedUpdate,
} from "../queries/templated-query.js";
import {
  DataMonitoringFunction,
  DayOfWeek,
  JobTemplateStatus as JobTemplateStatus,
  JobTemplateType as JobTemplateType,
  JobStatus as JobStatus,
  JobType as JobType,
  getEnumStringFromUri,
} from "../types.js";
import { v4 as uuidv4 } from "uuid";
import { createJob as createJob } from "./job.js";
import { delay, retry } from "../util/util.js";
import { logger } from "../logger.js";
import Handlebars from "handlebars";

export type UpdateJobTemplateStatusInput = {
  prefixes: string;
  jobGraphUri: string;
  jobTemplateUri: string;
  status: JobTemplateStatus;
  modifiedAt: DateTime;
};

export const updateJobTemplateStatusTemplate = Handlebars.compile(
  `\
{{prefixes}}
DELETE {
  GRAPH <{{jobGraphUri}}> {
    <{{jobTemplateUri}}>
      adms:status ?status;
      dct:modified ?modified.
  }
} INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{jobTemplateUri}}>
      adms:status {{toJobTemplateStatusLiteral status}};
      dct:modified {{toDateTimeLiteral modifiedAt}}.
  }
} WHERE {
  GRAPH <{{jobGraphUri}}> {
    <{{jobTemplateUri}}> a cogs:Job,datamonitoring:DatamonitoringTemplateJob;
      adms:status ?status;
      dct:modified ?modified.
  }
}
`,
  { noEscape: true }
);

export type WriteNewPeriodicJobTemplateInput = {
  prefixes: string;
  resourcesUriPrefix: string;
  jobGraphUri: string;
  uuid: string;
  newJobTemplateUri: string;
  status: JobTemplateStatus;
  createdAt: DateTime;
  description: string;
  jobTemplateType: JobTemplateType.PERIODIC;
  jobParametersUri: string;
  jobParametersUuid: string;
  datamonitoringFunction: DataMonitoringFunction;
  timeOfInvocation: TimeOnly;
  daysOfInvocation: DayOfWeek[];
};

export const insertPeriodicJobTemplateTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{newJobTemplateUri}}> a cogs:Job, datamonitoring:DatamonitoringTemplateJob;
      mu:uuid "{{uuid}}";
      dct:creator <{{resourcesUriPrefix}}job-creator/dm-count-report-generation-service>;
      adms:status {{toJobTemplateStatusLiteral status}};
      dct:created {{toDateTimeLiteral createdAt}};
      dct:modified {{toDateTimeLiteral createdAt}};
      datamonitoring:description "{{escape description}}";
      datamonitoring:jobType {{toJobTemplateTypeLiteral jobTemplateType}};
      datamonitoring:jobParameters <{{jobParametersUri}}>.

      <{{jobParametersUri}}> a datamonitoring:PeriodicJobTemplateParameters;
        mu:uuid "{{jobParametersUuid}}";
        datamonitoring:timeOfInvocation {{toTimeLiteral timeOfInvocation}};
        datamonitoring:function {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
        datamonitoring:daysOfInvocation
          {{#each daysOfInvocation}}{{toDayOfWeekLiteral this}}{{#unless @last}},{{/unless}}{{/each}}.
  }
} WHERE {

}
`,
  { noEscape: true }
);

type DeleteJobTemplateInput = {
  prefixes: string;
  jobGraphUri: string;
  uri: string;
};

const deleteJobTemplateInput = Handlebars.compile(
  `\
{{prefixes}}
DELETE {
  GRAPH <{{jobGraphUri}}> {
    <{{uri}}> ?p ?o.
    ?paramRes ?pp ?po.
  }
} WHERE {
  GRAPH <{{jobGraphUri}}> {
    <{{uri}}> datamonitoring:jobParameters ?paramRes.
  }
}
`,
  { noEscape: true }
);

export class JobTemplate {
  _updateStatusQuery: TemplatedInsert<UpdateJobTemplateStatusInput>;
  _deleteQuery: TemplatedUpdate<DeleteJobTemplateInput>;
  _graphUri: string;
  _jobTemplateType: JobTemplateType;
  _uuid: string;
  _status: JobTemplateStatus;
  private _deleted = false;
  get status() {
    if (this._deleted)
      throw new Error(`This resource has been deleted. Remove it's reference`);
    return this._status;
  }
  _datamonitoringFunction: DataMonitoringFunction;
  get datamonitoringFunction() {
    if (this._deleted)
      throw new Error(`This resource has been deleted. Remove it's reference`);
    return this._datamonitoringFunction;
  }
  get uuid() {
    if (this._deleted)
      throw new Error(`This resource has been deleted. Remove it's reference`);
    return this._uuid;
  }
  get jobTemplateType() {
    if (this._deleted)
      throw new Error(`This resource has been deleted. Remove it's reference`);
    return this._jobTemplateType;
  }

  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    jobTemplateType: JobTemplateType,
    graphUri: string,
    uuid: string,
    initialStatus: JobTemplateStatus,
    datamonitoringFunction: DataMonitoringFunction
  ) {
    this._updateStatusQuery = new TemplatedInsert<UpdateJobTemplateStatusInput>(
      queryEngine,
      endpoint,
      updateJobTemplateStatusTemplate
    );
    this._deleteQuery = new TemplatedUpdate<DeleteJobTemplateInput>(
      queryEngine,
      endpoint,
      deleteJobTemplateInput
    );
    this._jobTemplateType = jobTemplateType;
    this._graphUri = graphUri;
    this._uuid = uuid;
    this._status = initialStatus;
    this._datamonitoringFunction = datamonitoringFunction;
  }

  get uri() {
    if (this._deleted)
      throw new Error(`This resource has been deleted. Remove it's reference`);
    return `${config.env.URI_PREFIX_RESOURCES}job-template/${this._uuid}`;
  }

  async updateStatus(status: JobTemplateStatus) {
    if (this._deleted)
      throw new Error(`This resource has been deleted. Remove it's reference`);
    await this._updateStatusQuery.execute({
      prefixes: PREFIXES,
      modifiedAt: now(),
      status,
      jobGraphUri: this._graphUri,
      jobTemplateUri: this.uri,
    });
    this._status = status;
  }

  async deleteFromDb() {
    if (this._deleted)
      throw new Error(`This resource has been deleted. Remove it's reference`);
    // Remove from db
    await this._deleteQuery.execute({
      prefixes: PREFIXES,
      jobGraphUri: config.env.JOB_GRAPH_URI,
      uri: this.uri,
    });
    // Release from job map
    jobTemplates.delete(this.uri);
    this._deleted = true; // Kill this object.
  }

  /**
   * Creates a new job and manages the database. The function associated with it will be added to the execution queue.
   * @param args The arguments to be passed to the datamonitoring function associated with this template job
   * @returns A reference to the newly created job instance
   */
  async invoke(...args: any[]) {
    if (this._deleted)
      throw new Error(`This resource has been deleted. Remove it's reference`);
    const job = await createJob(this, JobType.SERIAL, JobStatus.NOT_STARTED);
    logger.debug(
      `Invoking job with uri ${this.uri}. Created job ${
        job.uri
      } with function ${getEnumStringFromUri(
        job.datamonitoringFunction,
        false
      )}`
    );
    await job.execute(...args); // Returns immediately
    return job;
  }

  toString() {
    return `Job template (${this.uri}) with status: ${getEnumStringFromUri(
      this.status,
      false
    )} and type ${getEnumStringFromUri(this.jobTemplateType, false)}`;
  }
}

export class PeriodicJobTemplate extends JobTemplate {
  _insertQuery: TemplatedInsert<WriteNewPeriodicJobTemplateInput>;
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
    initialStatus: JobTemplateStatus,
    datamonitoringFunction: DataMonitoringFunction,
    timeOfInvocation: TimeOnly,
    daysOfInvocation: DayOfWeek[]
  ) {
    super(
      queryEngine,
      endpoint,
      JobTemplateType.PERIODIC,
      graphUri,
      uuid,
      initialStatus,
      datamonitoringFunction
    );
    this._timeOfInvocation = timeOfInvocation;
    this._daysOfInvocation = daysOfInvocation;
    this._insertQuery = new TemplatedInsert<WriteNewPeriodicJobTemplateInput>(
      queryEngine,
      endpoint,
      insertPeriodicJobTemplateTemplate
    );
  }

  async _createNewResource() {
    const uuid = uuidv4();
    await this._insertQuery.execute({
      prefixes: PREFIXES,
      resourcesUriPrefix: config.env.URI_PREFIX_RESOURCES,
      uuid: this._uuid,
      jobGraphUri: this._graphUri,
      newJobTemplateUri: this.uri,
      status: this._status,
      createdAt: now(),
      description: `Job created by dm-count-report-generation-service`,
      jobTemplateType: JobTemplateType.PERIODIC,
      jobParametersUri: `${config.env.URI_PREFIX_RESOURCES}job-parameters/${uuid}`,
      jobParametersUuid: uuid,
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

export type WriteNewRestJobTemplateInput = {
  prefixes: string;
  resourcesUriPrefix: string;
  jobGraphUri: string;
  uuid: string;
  newJobTemplateUri: string;
  status: JobTemplateStatus;
  createdAt: DateTime;
  description: string;
  jobTemplateType: JobTemplateType.REST_INVOKED;
  jobParametersUri: string;
  jobParametersUuid: string;
  urlPath: string;
  datamonitoringFunction: DataMonitoringFunction;
};

export const insertRestJobTemplateTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{newJobTemplateUri}}> a cogs:Job, datamonitoring:DatamonitoringTemplateJob;
      mu:uuid "{{uuid}}";
      dct:creator <{{resourcesUriPrefix}}job-creator/dm-count-report-generation-service>;
      adms:status {{toJobTemplateStatusLiteral status}};
      dct:created {{toDateTimeLiteral createdAt}};
      dct:modified {{toDateTimeLiteral createdAt}};
      datamonitoring:description "{{escape description}}";
      datamonitoring:jobType {{toJobTemplateTypeLiteral jobTemplateType}};
      datamonitoring:jobParameters <{{jobParametersUri}}>.

      <{{jobParametersUri}}> a datamonitoring:restJobTemplateParameters;
        mu:uuid "{{jobParametersUuid}}";
        datamonitoring:function {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
        datamonitoring:urlPath "{{urlPath}}".
  }
} WHERE {

}
`,
  { noEscape: true }
);

export class RestJobTemplate extends JobTemplate {
  _insertQuery: TemplatedInsert<WriteNewRestJobTemplateInput>;
  _urlPath: string;
  get urlPath() {
    return this._urlPath;
  }
  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    graphUri: string,
    uuid: string,
    initialStatus: JobTemplateStatus,
    datamonitoringFunction: DataMonitoringFunction,
    urlPath: string
  ) {
    super(
      queryEngine,
      endpoint,
      JobTemplateType.REST_INVOKED,
      graphUri,
      uuid,
      initialStatus,
      datamonitoringFunction
    );
    (this._urlPath = urlPath),
      (this._insertQuery = new TemplatedInsert<WriteNewRestJobTemplateInput>(
        queryEngine,
        endpoint,
        insertRestJobTemplateTemplate
      ));
  }

  async _createNewResource() {
    const uuid = uuidv4();
    await this._insertQuery.execute({
      prefixes: PREFIXES,
      resourcesUriPrefix: config.env.URI_PREFIX_RESOURCES,
      uuid: this._uuid,
      jobGraphUri: this._graphUri,
      newJobTemplateUri: this.uri,
      status: this._status,
      createdAt: now(),
      description: `Job created by dm-count-report-generation-service`,
      jobTemplateType: JobTemplateType.REST_INVOKED,
      jobParametersUri: `${config.env.URI_PREFIX_RESOURCES}job-parameters/${uuid}`,
      jobParametersUuid: uuid,
      urlPath: this._urlPath,
      datamonitoringFunction: this._datamonitoringFunction,
    });
  }

  override toString(): string {
    return `${super.toString()}\n\tRest job with activated by HTTP using path "/${
      this.urlPath
    }"`;
  }
}

type DefaultJobTemplateCreationSettings = {
  queryEngine: QueryEngine;
  endpoint: string;
};

let defaults: DefaultJobTemplateCreationSettings | undefined = undefined;

const jobTemplates = new Map<string, JobTemplate>();

/**
 * Gets you a deep copy of the jobs array. Modifying it is no use. Use the other methods in the module to manipulate jobs
 * @returns An array of jobs
 */
export function getJobTemplates(): JobTemplate[] {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobTemplateCreeationDefaults' first from the job module.`
    );
  return [...jobTemplates.values()];
}

export function getPeriodicJobTemplates(): PeriodicJobTemplate[] {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobTemplateCreeationDefaults' first from the job module.`
    );
  return [...jobTemplates.values()].filter(
    (j) => j.jobTemplateType === JobTemplateType.PERIODIC
  ) as PeriodicJobTemplate[];
}

export function getRestJobTemplates(): RestJobTemplate[] {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobTemplateCreeationDefaults' first from the job module.`
    );
  return [...jobTemplates.values()].filter(
    (j) => j.jobTemplateType === JobTemplateType.REST_INVOKED
  ) as RestJobTemplate[];
}

/**
 * Retrieve a job template using its URI or uuid.
 * @param uriOrUuid
 * @returns The job template if found; undefined if not.
 */
export function getJobTemplate(uriOrUuid: string): JobTemplate | undefined {
  const test = jobTemplates.get(uriOrUuid);
  if (test) return test;
  return [...jobTemplates.values()].find((jt) => jt.uuid === uriOrUuid);
}

export function setJobTemplateCreeationDefaults(
  queryEngine: QueryEngine,
  endpoint: string
) {
  defaults = {
    queryEngine,
    endpoint,
  };
}

export async function createPeriodicJobTemplate(
  datamonitoringFunction: DataMonitoringFunction,
  timeOfInvocation: TimeOnly,
  daysOfInvocation: DayOfWeek[],
  initialStatus = JobTemplateStatus.NOT_STARTED
): Promise<PeriodicJobTemplate> {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  // Make the instance
  const newJobTemplate = new PeriodicJobTemplate(
    defaults.queryEngine,
    defaults.endpoint,
    config.env.JOB_GRAPH_URI,
    uuidv4(),
    initialStatus,
    datamonitoringFunction,
    timeOfInvocation,
    daysOfInvocation
  );
  // Make sure the database reflects the state of the instance
  await newJobTemplate._createNewResource();
  jobTemplates.set(newJobTemplate.uri, newJobTemplate);
  return newJobTemplate;
}

export async function createRestJobTemplate(
  datamonitoringFunction: DataMonitoringFunction,
  urlPath: string,
  initialStatus = JobTemplateStatus.NOT_STARTED
): Promise<RestJobTemplate> {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const newJob = new RestJobTemplate(
    defaults.queryEngine,
    defaults.endpoint,
    config.env.JOB_GRAPH_URI,
    uuidv4(),
    initialStatus,
    datamonitoringFunction,
    urlPath
  );
  await newJob._createNewResource();
  jobTemplates.set(newJob.uri, newJob);
  return newJob;
}

export type GetJobTemplatesInput = {
  prefixes: string;
  jobGraphUri: string;
};

export type GetJobTemplatesOutput = {
  jobTemplateUri: string;
  uuid: string;
  status: JobTemplateStatus;
  createdAt: DateTime;
  modifiedAt: DateTime;
  description: string;
  jobTemplateType: JobTemplateType;
  datamonitoringFunction: DataMonitoringFunction;
};

export type GetPeriodicJobTemplatesOutput = GetJobTemplatesOutput & {
  timeOfInvocation: TimeOnly;
  daysOfInvocation: DayOfWeek[];
};

export type GetRestJobTemplatesOutput = GetJobTemplatesOutput & {
  urlPath: string;
};

const getPeriodicJobTemplatesTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT * WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?jobTemplateUri a cogs:Job, datamonitoring:DatamonitoringTemplateJob;
      mu:uuid ?uuid;
      adms:status ?status;
      dct:created ?createdAt;
      dct:modified ?modifiedAt;
      datamonitoring:description ?description;
      datamonitoring:jobType ?jobTemplateType;
      datamonitoring:jobParameters [
        datamonitoring:function ?datamonitoringFunction;
        datamonitoring:timeOfInvocation ?timeOfInvocation;
        datamonitoring:daysOfInvocation ?daysOfInvocation;
      ].
  }
}
`,
  { noEscape: true }
);

export const getRestJobTemplatesTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT * WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?jobUri a cogs:Job, datamonitoring:DatamonitoringTemplateJob;
      mu:uuid ?uuid;
      adms:status ?status;
      dct:created ?createdAt;
      dct:modified ?modifiedAt;
      datamonitoring:description ?description;
      datamonitoring:jobType ?jobType;
      datamonitoring:jobParameters [
        datamonitoring:function ?datamonitoringFunction;
        datamonitoring:urlPath ?urlPath;
      ].

  }
}
`,
  { noEscape: true }
);

export async function loadJobTemplates() {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const getPeriodicJobTemplatesQuery = new TemplatedSelect<
    GetJobTemplatesInput,
    GetPeriodicJobTemplatesOutput
  >(defaults.queryEngine, defaults.endpoint, getPeriodicJobTemplatesTemplate);
  const getRestJobTemplatesQuery = new TemplatedSelect<
    GetJobTemplatesInput,
    GetRestJobTemplatesOutput
  >(defaults.queryEngine, defaults.endpoint, getRestJobTemplatesTemplate);
  const periodicJobTemplateRecords = await getPeriodicJobTemplatesQuery.objects(
    "jobTemplateUri",
    {
      prefixes: PREFIXES,
      jobGraphUri: config.env.JOB_GRAPH_URI,
    }
  );
  for (const record of periodicJobTemplateRecords) {
    const newJob = new PeriodicJobTemplate(
      defaults.queryEngine,
      defaults.endpoint,
      config.env.JOB_GRAPH_URI,
      record.uuid,
      record.status,
      record.datamonitoringFunction,
      record.timeOfInvocation,
      record.daysOfInvocation
    );
    jobTemplates.set(newJob.uri, newJob);
  }
  const restJobTemplateRecords = await retry(
    getRestJobTemplatesQuery.objects.bind(getRestJobTemplatesQuery)
  )("jobUri", {
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
  });
  for (const record of restJobTemplateRecords.result) {
    const newJob = new RestJobTemplate(
      defaults.queryEngine,
      defaults.endpoint,
      config.env.JOB_GRAPH_URI,
      record.uuid,
      record.status,
      record.datamonitoringFunction,
      record.urlPath
    );
    jobTemplates.set(newJob.uri, newJob);
  }
}

export type DeleteAllJobTemplatesInput = {
  prefixes: string;
  jobGraphUri: string;
  jobTemplateTypes: JobTemplateType[] | undefined;
};

export const deleteAllJobTemplatesTemplate = Handlebars.compile(
  `\
{{prefixes}}
DELETE {
  GRAPH <{{jobGraphUri}}> {
    ?blind ?pb ?ob.
    ?job ?p ?o.
  }
} WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?job a cogs:Job, datamonitoring:DatamonitoringTemplateJob;
      datamonitoring:jobParameters ?blind.
    {{#if (listPopulated jobTemplateTypes)}}
    {{#each jobTemplateTypes}}
      {
        ?job datamonitoring:jobType {{toJobTemplateTypeLiteral this}}.
      }
      {{#unless @last}}UNION{{/unless}}
    {{/each}}
    {{/if}}

    ?blind ?pb ?ob.
    ?job ?p ?o.
  }
}
`,
  { noEscape: true }
);

export async function deleteAllJobTemplates(
  jobTypes: JobTemplateType[] | undefined | Record<string, never> = undefined // The empty object it to make this function compatible as a debug endpoint function with no query parameters
) {
  if (!defaults)
    throw new Error(
      `Defaults have not been set. Call 'setJobCreeationDefaults' first from the job module.`
    );
  const noParams =
    !jobTypes ||
    (typeof jobTypes === "object" && Object.keys(jobTypes).length === 0);

  const defaultedJobTemplateTypes = noParams
    ? []
    : (jobTypes as JobTemplateType[]);

  const deleteAllJobTemplatesQuery =
    new TemplatedUpdate<DeleteAllJobTemplatesInput>(
      defaults.queryEngine,
      defaults.endpoint,
      deleteAllJobTemplatesTemplate
    );
  await deleteAllJobTemplatesQuery.execute({
    prefixes: PREFIXES,
    jobGraphUri: config.env.JOB_GRAPH_URI,
    jobTemplateTypes: defaultedJobTemplateTypes,
  });

  if (defaultedJobTemplateTypes.length === 0) {
    jobTemplates.clear(); // Remove all job templates? Release everything.
    return;
  }
  // In specific cases remove the references directly
  for (const [uri, job] of jobTemplates.entries()) {
    if (defaultedJobTemplateTypes.includes(job.jobTemplateType))
      jobTemplates.delete(uri);
  }
}

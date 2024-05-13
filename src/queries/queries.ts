import Handlebars from "handlebars";
import dayjs from "dayjs";
import "./../helpers/index.js"; // Making sure the modules in the helpers folder are loaded before these templates are compiled
import { DateOnly, TimeOnly } from "../util/date-time.js";
import {
  DataMonitoringFunction,
  DayOfWeek,
  JobStatus,
  JobType,
  TaskStatus,
  TaskType,
} from "../types.js";

export type TestQueryInput = {};
export type TestQueryOutput = {
  result: number;
};

export const testQueryTemplate = Handlebars.compile(
  `\
SELECT (1+1 as ?result) WHERE {}
`,
  { noEscape: true }
);

export type GetOrganisationsInput = {
  prefixes: string;
  limit: number;
  graphUri: string;
};

export type GetOrganisationsOutput = {
  organisationUri: string;
  label: string;
  id: string;
};

export const getOrganisationsTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT ?organisationUri ?label ?id WHERE {
  GRAPH <{{graphUri}}> {
    ?organisationUri a besluit:Bestuurseenheid;
      mu:uuid ?id;
      skos:prefLabel ?label;
      org:classification <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001>.
  }
} {{limitClause limit}}
`,
  { noEscape: true }
);

export type CountInput = {
  prefixes: string;
  classes: readonly string[];
};

export const getCountForOrgQueryTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT * WHERE {
  {{#each classes}}
  {
    SELECT (COUNT(DISTINCT ?res{{@index}}) as ?resCount{{@index}}) WHERE {
      ?res{{@index}} a <{{this}}>.
    }
  }
  {{/each}}
}
`,
  { noEscape: true }
);

export type GetGoveringBodiesInput = {
  prefixes: string;
  adminitrativeUnitUri: string;
  graphUri: string;
};

export type GetGoveringBodiesOutput = {
  goveringBodyUri: string;
  label: string;
};

export const getGoverningBodiesOfAdminUnitTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT ?goveringBodyUri ?label WHERE {
  GRAPH <{{graphUri}}> {
    ?goveringBodyUri a besluit:Bestuursorgaan;
      besluit:bestuurt <{{adminitrativeUnitUri}}>;
      skos:prefLabel ?label.
  }
}
`,
  { noEscape: true }
);

export type CountSessionsQueryInput = {
  prefixes: string;
  governingBodyUri: string;
  from: dayjs.Dayjs;
  to: dayjs.Dayjs;
  noFilterForDebug: boolean;
};

export type CountSessionsQueryOutput = {
  count: number;
};

export const countSessionsQueryTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT (COUNT(DISTINCT ?session) as ?count) WHERE {
  {
    ?session a besluit:Zitting;
      besluit:isGehoudenDoor <{{governingBodyUri}}>.
  } UNION {
    ?session a besluit:Zitting;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
        mandaat:isTijdspecialisatieVan <{{governingBodyUri}}>.
  }
  ?session besluit:geplandeStart ?plannedStart.
  {{#unless noFilterForDebug}}
  FILTER(?plannedStart >= {{toDateTimeLiteral from}})
  FILTER(?plannedStart < {{toDateTimeLiteral to}})
  {{/unless}}
}

`,
  { noEscape: true }
);

export type CountAgendaItemsQueryInput = {
  prefixes: string;
  governingBodyUri: string;
  from: dayjs.Dayjs;
  to: dayjs.Dayjs;
  noFilterForDebug: boolean;
};

export type CountAgendaItemsQueryOutput = {
  count: number;
};

export const countAgendaItemsQueryTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT (COUNT(DISTINCT ?agendaItem) as ?count) WHERE {
  {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor <{{governingBodyUri}}>.
  } UNION {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
      mandaat:isTijdspecialisatieVan <{{governingBodyUri}}>.
  }
  ?agendaItem a besluit:Agendapunt.
  ?session besluit:geplandeStart ?plannedStart.


  ?agendaItemHandling a besluit:BehandelingVanAgendapunt;
    dct:subject ?agendaItem;
    prov:generated ?anyBesluit.
  ?anyBesluit a besluit:Besluit.

  {{#unless noFilterForDebug}}
  FILTER(?plannedStart >= {{toDateTimeLiteral from}})
  FILTER(?plannedStart < {{toDateTimeLiteral to}})
  {{/unless}}
}

`,
  { noEscape: true }
);

export type CountResolutionsQueryInput = {
  prefixes: string;
  governingBodyUri: string;
  from: dayjs.Dayjs;
  to: dayjs.Dayjs;
  noFilterForDebug: boolean;
};

export type CountResolutionsQueryOutput = {
  count: number;
};

export const countResolutionsQueryTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT (COUNT(DISTINCT ?resolution) as ?count) WHERE {
  {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor <{{governingBodyUri}}>.
  } UNION {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
      mandaat:isTijdspecialisatieVan <{{governingBodyUri}}>.
  }
  ?agendaItem a besluit:Agendapunt.
  ?session besluit:geplandeStart ?plannedStart.

  ?agendaItemHandling a besluit:BehandelingVanAgendapunt;
    dct:subject ?agendaItem;
    prov:generated ?resolution.

  ?resolution a besluit:Besluit;
    eli:date_publication ?datePublication.

  {{#unless noFilterForDebug}}
  FILTER(?plannedStart >= {{toDateTimeLiteral from}})
  FILTER(?plannedStart < {{toDateTimeLiteral to}})
  {{/unless}}
}

`,
  { noEscape: true }
);

export type CountVoteQueryInput = {
  prefixes: string;
  governingBodyUri: string;
  from: dayjs.Dayjs;
  to: dayjs.Dayjs;
  noFilterForDebug: boolean;
};

export type CountVoteQueryOutput = {
  count: number;
};

export const countVoteQueryTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT (COUNT(DISTINCT ?vote) as ?count) WHERE {
  {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem.
  } UNION {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
        mandaat:isTijdspecialisatieVan ?governingBodyAbstract.
  }
  ?session besluit:geplandeStart ?plannedStart.
  ?agendaItem a besluit:Agendapunt.

  ?agendaItemHandling a besluit:BehandelingVanAgendapunt;
    dct:subject ?agendaItem;
    besluit:heeftStemming ?vote.

  ?vote a besluit:Stemming.
  {{#unless noFilterForDebug}}
  FILTER(?plannedStart >= {{toDateTimeLiteral from}})
  FILTER(?plannedStart < {{toDateTimeLiteral to}})
  {{/unless}}
}

`,
  { noEscape: true }
);

export type WriteReportInput = {
  prefixes: string;
  reportGraphUri: string;
  reportUri: string;
  createdAt: dayjs.Dayjs;
  day: DateOnly;
  govBodyUri: string;
  adminUnitUri: string;
  prefLabel: string;
  counts: {
    classUri: string;
    count: number;
    prefLabel: string;
  }[];
};

export const writeCountReportQueryTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH <{{reportGraphUri}}> {
    <{{reportUri}}> a datamonitoring:GoverningBodyCountReport;
      datamonitoring:createdAt {{toDateTimeLiteral createdAt}};
      datamonitoring:day {{toDateLiteral day}};
      datamonitoring:targetAdminitrativeUnit <{{adminUnitUri}}>;
      datamonitoring:targetGoverningBody <{{govBodyUri}}>;
      skos:prefLabel "{{prefLabel}}";
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:counts
      {{#each counts}}
        [
          a datamonitoring:Count;
          datamonitoring:targetClass <{{this.classUri}}>;
          datamonitoring:count {{this.count}};
          skos:prefLabel "{{prefLabel}}";
        ]{{#unless @last}},{{/unless}}
     {{/each}}
  }
} WHERE {

}
`,
  { noEscape: true }
);

export type WriteAdminUnitReportInput = {
  prefixes: string;
  prefLabel: string;
  reportGraphUri: string;
  reportUri: string;
  createdAt: dayjs.Dayjs;
  adminUnitUri: string;
  day: DateOnly;
  reportUris: string[];
};

export const writeAdminUnitCountReportTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH <{{reportGraphUri}}> {
    <{{reportUri}}> a datamonitoring:AdminUnitCountReport;
      skos:prefLabel "{{prefLabel}}";
      datamonitoring:targetAdminitrativeUnit <{{adminUnitUri}}>;
      datamonitoring:createdAt {{toDateTimeLiteral createdAt}};
      datamonitoring:day: {{toDateLiteral day}};
      datamonitoring:istest "true"^^xsd:boolean
      {{#if (listPopulated reportUris)}}
      ;
      datamonitoring:goveringBodyReports
      {{#each reportUris}}
        <{{this}}>
        {{#unless @last}},{{/unless}}
      {{/each}}
      .
      {{else}}
      .
      {{/if}}
  }
} WHERE { }
`,
  { noEscape: true }
);

export type WriteNewTaskInput = {
  prefixes: string;
  jobGraphUri: string;
  taskUri: string;
  uuid: string;
  status: TaskStatus;
  createdAt: dayjs.Dayjs;
  index: number;
  description: string;
  taskType: TaskType;
  datamonitoringFunction: DataMonitoringFunction;
  jobUri: string;
};

export const insertTaskTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{taskUri}}> a task:Task, datamonitoring:DatamonitoringTask;
      mu:uuid "{{uuid}}";
      dct:creator <https://codifly.be/ns/resources/task-creator/dm-count-report-generation-service>;
      adms:status {{toTaskStatusLiteral status}};
      dct:created {{toDateTimeLiteral createdAt}};
      dct:modified {{toDateTimeLiteral createdAt}};
      task:operation {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
      task:index {{index}};
      dct:isPartOf <{{jobUri}}>;
      datamonitoring:function {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
      datamonitoring:description "{{description}}";
      datamonitoring:taskType {{toTaskTypeLiteral taskType}}.
  }
} WHERE {

}
`,
  { noEscape: true }
);

export type GetTasksInput = {
  prefixes: string;
  jobGraphUri: string;
  taskStatuses: TaskStatus[];
};

export type GetTasksOutput = {
  taskUri: string;
  uuid: string;
  status: TaskStatus;
  datamonitoringFunction: DataMonitoringFunction;
  taskType: TaskType;
  jobUri: string;
};

export const getTasksTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT * WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?taskUri a task:Task, datamonitoring:DatamonitoringTask;
      mu:uuid ?uuid;
      datamonitoring:function ?datamonitoringFunction;
      datamonitoring:taskType ?taskType;
      dct:isPartOf: ?jobUri.
    {{#each taskStatuses}}
    {
      ?taskUri adms:status {{toTaskStatusLiteral this}}.
    }
    {{#unless @last}}UNION{{/unless}}
    {{/each}}
  }
}
`,
  { noEscape: true }
);

export type DeleteBusyTasksInput = {
  prefixes: string;
  jobGraphUri: string;
};

export const deleteBusyTasksTemplate = Handlebars.compile(
  `\
{{prefixes}}
DELETE {
  GRAPH <{{jobGraphUri}}> {
    ?taskUri ?p ?o.
  }
}
WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?taskUri a task:Task;
      adms:status <https://codifly.be/ns/resources/status/busy>;
      ?p ?o.
  }
}
`,
  { noEscape: true }
);

export type UpdateTaskStatusInput = {
  prefixes: string;
  jobGraphUri: string;
  taskUri: string;
  status: TaskStatus;
  modifiedAt: dayjs.Dayjs;
};

export const updateTaskStatusTemplate = Handlebars.compile(
  `\
{{prefixes}}
DELETE {
  GRAPH <{{jobGraphUri}}> {
    <{{taskUri}}
      adms:status ?status;
      dct:modified ?modified.
  }
} INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{taskUri}}>
      adms:status {{toTaskStatusLiteral status}};
      dct:modified {{toDateTimeLiteral modifiedAt}}.
  }
} WHERE {
  GRAPH <{{jobGraphUri}}> {
    <{{taskUri}}> a task:Task,datamonitoring:DatamonitoringTask;
      adms:status ?status;
      dct:modified ?modified.
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
  modifiedAt: dayjs.Dayjs;
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

export type GetJobsInput = {
  prefixes: string;
  jobGraphUri: string;
};

export type GetJobsOutput = {
  jobUri: string;
  uuid: string;
  status: JobStatus;
  createdAt: dayjs.Dayjs;
  modifiedAt: dayjs.Dayjs;
  description: TaskStatus;
  jobType: JobType;
  datamonitoringFunction: DataMonitoringFunction;
};

export type GetPeriodicJobsOutput = GetJobsOutput & {
  timeOfInvocation: TimeOnly;
  daysOfInvocation: DayOfWeek[];
};

export type GetRestJobsOutput = GetJobsOutput & {
  restPath: string;
};

export const getPeriodicJobsTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT * WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?jobUri a cogs:Job, datamonitoring:DatamonitoringJob;
      mu:uuid ?uuid;
      adms:status ?status;
      dct:created ?createdAt;
      dct:modified ?modifiedAt;
      datamonitoring:description ?description;
      datamonitoring:jobType ?jobType;
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

export const getRestJobsTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT * WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?jobUri a cogs:Job, datamonitoring:DatamonitoringJob;
      mu:uuid ?uuid;
      adms:status ?status;
      dct:created ?createdAt;
      dct:modified ?modifiedAt;
      datamonitoring:description ?description;
      datamonitoring:jobType ?jobType;
      datamonitoring:jobParameters [
        datamonitoring:function ?datamonitoringFunction;
        datamonitoring:restPath ?restPath;
      ].

  }
}
`,
  { noEscape: true }
);

export type WriteNewPeriodicJobInput = {
  prefixes: string;
  jobGraphUri: string;
  uuid: string;
  newJobUri: string;
  status: JobStatus;
  createdAt: dayjs.Dayjs;
  description: string;
  jobType: JobType.PERIODIC;
  timeOfInvocation: TimeOnly;
  daysOfInvocation: DayOfWeek[];
  datamonitoringFunction: DataMonitoringFunction;
};

export const insertPeriodicJobTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{newJobUri}}> a cogs:Job, datamonitoring:DatamonitoringJob;
      mu:uuid "{{uuid}}";
      dct:creator <https://codifly.be/ns/resources/job-creator/dm-count-report-generation-service>;
      adms:status {{toJobStatusLiteral status}};
      dct:created {{toDateTimeLiteral createdAt}};
      dct:modified {{toDateTimeLiteral createdAt}};
      datamonitoring:description "{{description}}";
      datamonitoring:jobType {{toJobTypeLiteral jobType}};
      datamonitoring:jobParameters [
        datamonitoring:timeOfInvocation {{toTimeLiteral timeOfInvocation}};
        datamonitoring:function {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
        datamonitoring:daysOfInvocation {{#each daysOfInvocation}}{{toDayOfWeekLiteral this}}{{#unless @last}},{{/unless}}{{/each}};
      ].
  }
} WHERE {

}
`,
  { noEscape: true }
);

export type WriteNewRestJobInput = {
  prefixes: string;
  jobGraphUri: string;
  uuid: string;
  newJobUri: string;
  status: JobStatus;
  createdAt: dayjs.Dayjs;
  description: string;
  jobType: JobType.REST_INVOKED;
  restPath: string;
  datamonitoringFunction: DataMonitoringFunction;
};

export const insertRestJobTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH <{{jobGraphUri}}> {
    <{{newJobUri}}> a cogs:Job, datamonitoring:DatamonitoringJob;
      mu:uuid "{{uuid}}";
      dct:creator <https://codifly.be/ns/resources/job-creator/dm-count-report-generation-service>;
      adms:status {{toJobStatusLiteral status}};
      dct:created {{toDateTimeLiteral createdAt}};
      dct:modified {{toDateTimeLiteral createdAt}};
      datamonitoring:description "{{description}}";
      datamonitoring:jobType {{toJobTypeLiteral jobType}};
      datamonitoring:jobParameters [
        datamonitoring:function {{toDatamonitoringFunctionLiteral datamonitoringFunction}};
        datamonitoring:restPath "{{restPath}}";
      ].
  }
} WHERE {

}
`,
  { noEscape: true }
);

export type DeleteAllJobsInput = {
  prefixes: string;
  jobGraphUri: string;
};

export const deleteAllJobsTemplate = Handlebars.compile(
  `\
{{prefixes}}
DELETE {
  GRAPH <{{jobGraphUri}}> {
    ?blind ?pb ?ob.
    ?job ?p ?o.
  }
} WHERE {
  GRAPH <{{jobGraphUri}}> {
    ?job a cogs:Job, datamonitoring:DatamonitoringJob;
      datamonitoring:jobParameters ?blind.
    ?blind ?pb ?ob.
    ?job ?p ?o.
  }
}
`,
  { noEscape: true }
);

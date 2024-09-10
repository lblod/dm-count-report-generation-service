import { DateOnly, DateTime } from "../../util/date-time.js";
import { compileSparql } from "../../handlebars/index.js";

export type CountSessionsPerAdminUnitInput = {
  prefixes: string;
  governingBodyUris: string[];
  noFilterForDebug: boolean;
  from: DateTime;
  to: DateTime;
};

export type CountSessionUnitsPerAdminUnitOutput = {
  govBodyUri: string;
  sessionCount: number;
};

export const countSessionsPerAdminUnitTemplate = compileSparql(
  `\
{{prefixes}}

SELECT ?governingBodyUri (COUNT(?sessionUri) as ?sessionCount) WHERE {
  VALUES ?governingBodyUri {
    {{#each governingBodyUris}}{{toNode this}}
    {{/each}}
  }

  ?sessionUri a besluit:Zitting;
    besluit:isGehoudenDoor ?governingBodyUri;
    besluit:geplandeStart ?plannedStart.


  {{#unless noFilterForDebug}}
  FILTER(?plannedStart >= {{toDateTime from}})
  FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
} GROUP BY ?governingBodyUri
`
);

export type GetSessionsInput = {
  prefixes: string;
  governingBodyUri: string;
  noFilterForDebug: boolean;
  from: DateTime;
  to: DateTime;
  limit: number;
};

export type GetSessionsOuput = {
  sessionUri: string;
  uuid: string;
  documentUri: string[] | undefined;
};

export const getSessionsTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?sessionUri ?uuid ?documentUri WHERE {
  ?sessionUri a besluit:Zitting;
      besluit:isGehoudenDoor {{toNode governingBodyUri}};
      besluit:geplandeStart ?plannedStart;
      mu:uuid ?uuid;
      prov:wasDerivedFrom ?documentUri.
  {{#unless noFilterForDebug}}
  FILTER(?plannedStart >= {{toDateTime from}})
  FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
} {{limitClause limit}}
`
);

export type AnalyseAgendaItemsInput = {
  prefixes: string;
  sessionUri: string;
};

export type AnalyseAgendaItemsOutput = {
  agendaItemUri: string;
  documentUri: string[] | string;
};

export const analyseAgendaItemsTemplate = compileSparql(`\
{{prefixes}}
SELECT ?agendaItemUri ?documentUri WHERE {
  {{toNode sessionUri}} besluit:behandelt ?agendaItemUri.

  ?agendaItemUri a besluit:Agendapunt;
    prov:wasDerivedFrom ?documentUri.
}
`);

export type AgendaItemReportInput = {
  agendaItemCheckUri: string;
  uuid: string;
  hasResolutions: boolean;
  hasAgenda: boolean;
  hasNotes: boolean;
  urls: string[];
  targetAgendaPointUri: string;
};

export type SessionCheckReportInput = {
  sessionCheckUri: string;
  sessionUri: string;
  prefLabel: string;
  uuid: string;
  urls: string[];
  agendaItemReports: AgendaItemReportInput[];
};

export type WriteGoverningBodyReportInput = {
  prefixes: string;
  reportGraphUri: string;
  reportUri: string;
  createdAt: DateTime;
  day: DateOnly;
  govBodyUri: string;
  adminUnitUri: string;
  prefLabel: string;
  uuid: string;
  totalSessions: number;
  sessionCheckReports: SessionCheckReportInput[];
};
export const writeGoverningBodyReportTemplate = compileSparql(
  `\
{{prefixes}}
INSERT {
  GRAPH {{toNode reportGraphUri}} {
    {{toNode reportUri}} a datamonitoring:GoverningBodyDocumentPresenceCheckReport;
      datamonitoring:createdAt {{toDateTime createdAt}};
      datamonitoring:day {{toDate day}};
      datamonitoring:targetAdministrativeUnit {{toNode adminUnitUri}};
      datamonitoring:targetGoverningBody {{toNode govBodyUri}};
      skos:prefLabel {{toString prefLabel}};
      mu:uuid {{toUuid uuid}};
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:totalSessions {{toInteger totalSessions}}.


    {{#if (listPopulated sessionCheckReports)}}
    {{toNode reportUri}} datamonitoring:sessionCheckReports
        {{#each sessionCheckReports}}{{toNode this.sessionCheckUri}}{{#unless @last}},{{/unless}}{{/each}}.
    {{/if}}

    {{#each sessionCheckReports}}
    {{toNode this.sessionCheckUri}} a datamonitoring:DocumentPresenceSessionCheck;
      mu:uuid {{toUuid this.uuid}};
      skos:prefLabel {{toString this.prefLabel}};
      datamonitoring:targetSession {{toNode this.sessionUri}}.
    {{#if (listPopulated this.urls)}}
    {{toNode this.sessionCheckUri}}
      datamonitoring:documentUrl
        {{#each this.urls}}{{toString this}}{{#unless @last}},{{/unless}}{{/each}}.
    {{/if}}
    {{#if (listPopulated this.agendaItemReports)}}
    {{toNode this.sessionCheckUri}}
      datamonitoring:agendaItemReports
        {{#each this.agendaItemReports}}{{toNode this.agendaItemCheckUri}}{{#unless @last}},{{/unless}}{{/each}}.

    {{#each this.agendaItemReports}}
    {{toNode this.agendaItemCheckUri}} a datamonitoring:DocumentPresenceAgendaItemCheck;
      mu:uuid {{toUuid this.uuid}};
      datamonitoring:hasResolutions {{toBoolean this.hasResolutions}};
      datamonitoring:hasNotes {{toBoolean this.hasNotes}};
      datamonitoring:hasAgenda {{toBoolean this.hasAgenda}};
      datamonitoring:targetAgendaPoint {{toNode this.targetAgendaPointUri}}.

    {{#if (listPopulated this.urls)}}
    {{toNode this.agendaItemCheckUri}}
      datamonitoring:documentUrl
        {{#each this.urls}}{{toString this}}{{#unless @last}},{{/unless}}{{/each}}.
    {{/if}}

    {{/each}}
    {{/if}}
    {{/each}}
  }
} WHERE {

}
`
);

export type WriteAdminUnitReportInput = {
  prefixes: string;
  prefLabel: string;
  reportGraphUri: string;
  reportUri: string;
  createdAt: DateTime;
  adminUnitUri: string;
  day: DateOnly;
  uuid: string;
  reportUris: string[];
};

export const writeAdminUnitReportTemplate = compileSparql(
  `\
{{prefixes}}
INSERT {
  GRAPH {{toNode reportGraphUri}} {
    {{toNode reportUri}} a datamonitoring:AdminUnitDocumentPresenceCheckReport;
      skos:prefLabel {{toString prefLabel}};
      datamonitoring:targetAdministrativeUnit {{toNode adminUnitUri}};
      datamonitoring:createdAt {{toDateTime createdAt}};
      datamonitoring:day {{toDate day}};
      mu:uuid {{toUuid uuid}};
      datamonitoring:istest "true"^^xsd:boolean
      {{#if (listPopulated reportUris)}}
      ;
      datamonitoring:governingBodyReports
      {{#each reportUris}}
        {{toNode this}}
        {{#unless @last}},{{/unless}}
      {{/each}}
      .
      {{else}}
      .
      {{/if}}
  }
} WHERE { }
`
);

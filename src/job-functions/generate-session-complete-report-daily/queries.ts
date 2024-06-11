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

SELECT ?goveringBodyUri (COUNT(?sessionUri) as ?sessionCount) WHERE {
  VALUES ?goveringBodyUri {
    {{#each governingBodyUris}}{{toNode this}}{{#unless @last}},{{/unless}}
    {{/each}}
  }

  ?sessionUri a besluit:Zitting;
    besluit:isGehoudenDoor ?goveringBodyUri;
    besluit:geplandeStart ?plannedStart.

  {{#unless noFilterForDebug}}
  FILTER(?plannedStart >= {{toDateTime from}})
  FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
}
`
);

export type GetSessionsInput = {
  prefixes: string;
  governingBodyUri: string;
  noFilterForDebug: boolean;
  from: DateTime;
  to: DateTime;
};

export type GetSessionsOuput = {
  sessionUri: string;
  uuid: string;
};

export const getSessionsTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?sessionUri ?uuid WHERE {
  ?sessionUri a besluit:Zitting;
    besluit:isGehoudenDoor {{toNode governingBodyUri}};
    besluit:geplandeStart ?plannedStart;
    mu:uuid ?uuid.

  {{#unless noFilterForDebug}}
  FILTER(?plannedStart >= {{toDateTime from}})
  FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
}
`
);

export type AnalyseAgendaItemsInput = {
  prefixes: string;
  sessionUri: string;
};

export type AnalyseAgendaItemsOutput = {
  agendaItemUri: string;
  documentUri: string[] | string;
  documentClassUri: string[] | string;
};

export const analyseAgendaItemsTemplate = compileSparql(`\
{{prefixes}}
SELECT ?agendaItemUri ?documentUri ?documentClassUri WHERE {
  {{toNode sessionUri}} besluit:behandelt ?agendaItemUri.

  ?agendaItemUri a besluit:AgendaPunt;
    prov:wasDerivedFrom ?documentUri.

  ?documentUri a ?documentClassUri.
}
`);

export type BadAgendaItemInput = {
  agendaItemCheckUri: string;
  uuid: string;
  hasResolutions: boolean;
  hasAgenda: boolean;
  hasNotes: boolean;
  urls: string[];
};

export type SessionCheckReportInput = {
  sessionCheckUri: string;
  sessionUri: string;
  prefLabel: string;
  uuid: string;
  documentsPresent: boolean;
  urls: string[];
  badAgendaItems: BadAgendaItemInput[];
};

export type WriteGoveringBodyReportInput = {
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
  totalBadSessions: number;
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
      datamonitoring:totalSessions {{toInteger totalSessions}};
      datamonitoring:totalBadSessions {{toInteger totalBadSessions}}.


    {{#if (listPopulated sessionCheckReports)}}
    {{toNode reportUri}} datamonitoring:sessionCheckReports
        {{#each sessionCheckReports}}{{toNode this.sessionCheckUri}}{{#unless @last}},{{/unless}}{{/each}}.
    {{/if}}

    {{#each sessionCheckReports}}
    {{toNode this.sessionCheckUri}} a datamonitoring:DocumentPresenceSessionCheck;
      mu:uuid {{toUuid this.uuid}};
      skos:prefLabel {{toString this.prefLabel}};
      datamonitoring:hasAllDocuments {{toBoolean this.hasAllDocuments}};
      datamonitoring:targetSession {{toNode this.sessionUri}};
      datamonitoring:documentsPresent {{toBoolean this.documentsPresent}}.
    {{#if (listPopulated this.urls)}}
    {{toNode this.sessionCheckUri}}
      datamonitoring:documentUrl
        {{#each this.urls}}{{toString this}}{{#unless @last}},{{/unless}}{{/each}}.
    {{/if}}
    {{#if (listPopulated this.badAgendaItems)}}
    {{toNode this.sessionCheckUri}}
      datamonitoring:badAgendaItems
        {{#each this.badAgendaItems}}{{toNode this.agendaItemCheckUri}}{{#unless @last}},{{/unless}}{{/each}}.

    {{#each this.badAgendaItems}}
    {{toNode this.agendaItemCheckUri}} a datamonitoring:DocumentPresenceAgendaItemCheck;
      mu:uuid {{toUuid this.uuid}};
      datamonitoring:hasResolutions this.hasResolutions;
      datamonitoring:hasNotes this.hasNotes;
      datamonitoring:hasAgenda this.hasAgenda.

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
  totalBadGoverningBodies: number;
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
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:badGoverningBodies {{toInteger totalBadGoverningBodies}}
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

import { DateOnly, DateTime } from "../../util/date-time.js";
import { compileSparql } from "../../handlebars/index.js";

export const checkSessionsQueryTemplate = compileSparql(
  `\
{{prefixes}}
SELECT (COUNT(DISTINCT ?session) as ?count) WHERE {
  {
    ?session a besluit:Zitting;
      besluit:isGehoudenDoor {{uriToNode governingBodyUri}}.
  } UNION {
    ?session a besluit:Zitting;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
        mandaat:isTijdspecialisatieVan {{uriToNode governingBodyUri}}.
  }
  ?session besluit:geplandeStart ?plannedStart.
  {{#unless noFilterForDebug}}
  FILTER(?plannedStart >= {{toDateTime from}})
  FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
}

`
);

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
  totalCompleteSessions: number;
  checks: {
    checkUri: string;
    sessionUri: string;
    hasMeetingNotes: boolean; // Notulen
    hasAgenda: boolean; // Agenda
    hasResolutionList: boolean; // Besluitenlijst
    hasAll: boolean;
    hasNone: boolean;
    prefLabel: string;
    uuid: string;
  }[];
};

export const writeGoverningBodyReportTemplate = compileSparql(
  `\
{{prefixes}}
INSERT {
  GRAPH {{uriToNode reportGraphUri}} {
    {{uriToNode reportUri}} a datamonitoring:GoverningBodyDocumentPresenceCheckReport;
      datamonitoring:createdAt {{toDateTime createdAt}};
      datamonitoring:day {{toDate day}};
      datamonitoring:targetAdministrativeUnit {{uriToNode adminUnitUri}};
      datamonitoring:targetGoverningBody {{uriToNode govBodyUri}};
      skos:prefLabel {{toString prefLabel}};
      mu:uuid {{toUuid uuid}};
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:totalSessions {{toInteger totalSessions}};
      datamonitoring:totalCompleteSessions {{toInteger totalCompleteSessions}};
      datamonitoring:sessionCheckReports
        {{#each checks}}{{uriToNode this.checkUri}}{{#unless @last}},{{/unless}}{{/each}}.

    {{#each checks}}
    {{uriToNode this.checkUri}} a datamonitoring:DocumentPresenceSessionCheck;
      mu:uuid {{toUuid this.uuid}};
      skos:prefLabel {{toString this.prefLabel}};
      datamonitoring:targetSession {{uriToNode this.sessionUri}};
      datamonitoring:hasMeetingNotes {{toBoolean this.hasMeetingNotes}};
      datamonitoring:hasAgenda {{toBoolean this.hasAgenda}};
      datamonitoring:hasResolutionList {{toBoolean this.hasResolutionList}};
      datamonitoring:hasAll {{toBoolean this.hasAll}};
      datamonitoring:hasNone {{toBoolean this.hasNone}}.
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
  GRAPH {{uriToNode reportGraphUri}} {
    {{uriToNode reportUri}} a datamonitoring:AdminUnitDocumentPresenceCheckReport;
      skos:prefLabel {{toString prefLabel}};
      datamonitoring:targetAdministrativeUnit {{uriToNode adminUnitUri}};
      datamonitoring:createdAt {{toDateTime createdAt}};
      datamonitoring:day {{toDate day}};
      mu:uuid {{toUuid uuid}};
      datamonitoring:istest "true"^^xsd:boolean
      {{#if (listPopulated reportUris)}}
      ;
      datamonitoring:governingBodyReports
      {{#each reportUris}}
        {{uriToNode this}}
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

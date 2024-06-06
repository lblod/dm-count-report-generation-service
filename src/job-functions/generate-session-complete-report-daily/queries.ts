import Handlebars from "handlebars";
import "./../helpers/index.js"; // Making sure the modules in the helpers folder are loaded before these templates are compiled
import { DateOnly, DateTime } from "../../util/date-time.js";

export const checkSessionsQueryTemplate = Handlebars.compile(
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
  FILTER(?plannedStart >= {{toDateTimeLiteral from}})
  FILTER(?plannedStart < {{toDateTimeLiteral to}})
  {{/unless}}
}

`,
  { noEscape: true }
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

export const writeGoverningBodyReportTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH {{uriToNode reportGraphUri}} {
    {{uriToNode reportUri}} a datamonitoring:GoverningBodyDocumentPresenceCheckReport;
      datamonitoring:createdAt {{toDateTimeLiteral createdAt}};
      datamonitoring:day {{toDateLiteral day}};
      datamonitoring:targetAdministrativeUnit {{uriToNode adminUnitUri}};
      datamonitoring:targetGoverningBody {{uriToNode govBodyUri}};
      skos:prefLabel {{toStringLiteral prefLabel}};
      mu:uuid {{toUuidLiteral uuid}};
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:totalSessions {{toIntegerLiteral totalSessions}};
      datamonitoring:totalCompleteSessions {{toIntegerLiteral totalCompleteSessions}};
      datamonitoring:sessionCheckReports
        {{#each checks}}{{uriToNode this.checkUri}}{{#unless @last}},{{/unless}}{{/each}}.

    {{#each checks}}
    {{uriToNode this.checkUri}} a datamonitoring:DocumentPresenceSessionCheck;
      mu:uuid {{toUuidLiteral this.uuid}};
      skos:prefLabel {{toStringLiteral this.prefLabel}};
      datamonitoring:targetSession {{uriToNode this.sessionUri}};
      datamonitoring:hasMeetingNotes {{toBooleanLiteral this.hasMeetingNotes}};
      datamonitoring:hasAgenda {{toBooleanLiteral this.hasAgenda}};
      datamonitoring:hasResolutionList {{toBooleanLiteral this.hasResolutionList}};
      datamonitoring:hasAll {{toBooleanLiteral this.hasAll}};
      datamonitoring:hasNone {{toBooleanLiteral this.hasNone}}.
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
  createdAt: DateTime;
  adminUnitUri: string;
  day: DateOnly;
  uuid: string;
  reportUris: string[];
};

export const writeAdminUnitReportTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH {{uriToNode reportGraphUri}} {
    {{uriToNode reportUri}} a datamonitoring:AdminUnitDocumentPresenceCheckReport;
      skos:prefLabel {{toStringLiteral prefLabel}};
      datamonitoring:targetAdministrativeUnit {{uriToNode adminUnitUri}};
      datamonitoring:createdAt {{toDateTimeLiteral createdAt}};
      datamonitoring:day {{toDateLiteral day}};
      mu:uuid {{toUuidLiteral uuid}};
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
`,
  { noEscape: true }
);

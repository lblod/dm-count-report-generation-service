import Handlebars from "handlebars";
import "./../helpers/index.js"; // Making sure the modules in the helpers folder are loaded before these templates are compiled
import { DateOnly, DateTime } from "../../util/date-time.js";

export type CountSessionsQueryInput = {
  prefixes: string;
  governingBodyUri: string;
  from: DateTime;
  to: DateTime;
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

export type CountAgendaItemsQueryInput = {
  prefixes: string;
  governingBodyUri: string;
  from: DateTime;
  to: DateTime;
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
      besluit:isGehoudenDoor {{uriToNode governingBodyUri}}.
  } UNION {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
      mandaat:isTijdspecialisatieVan {{uriToNode governingBodyUri}}.
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
  from: DateTime;
  to: DateTime;
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
      besluit:isGehoudenDoor {{uriToNode governingBodyUri}}.
  } UNION {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
      mandaat:isTijdspecialisatieVan {{uriToNode governingBodyUri}}.
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
  from: DateTime;
  to: DateTime;
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
  createdAt: DateTime;
  day: DateOnly;
  govBodyUri: string;
  adminUnitUri: string;
  prefLabel: string;
  uuid: string;
  counts: {
    countUri: string;
    classUri: string;
    count: number;
    prefLabel: string;
    uuid: string;
  }[];
};

export const writeCountReportQueryTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH {{uriToNode reportGraphUri}} {
    {{uriToNode reportUri}} a datamonitoring:GoverningBodyCountReport;
      datamonitoring:createdAt {{toDateTimeLiteral createdAt}};
      datamonitoring:day {{toDateLiteral day}};
      datamonitoring:targetAdministrativeUnit {{uriToNode adminUnitUri}};
      datamonitoring:targetGoverningBody {{uriToNode govBodyUri}};
      skos:prefLabel {{toStringLiteral prefLabel}};
      mu:uuid {{toUuidLiteral uuid}};
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:publicationCountReports
        {{#each counts}}{{uriToNode this.countUri}}{{#unless @last}},{{/unless}}{{/each}}.

    {{#each counts}}
    {{uriToNode this.countUri}} a datamonitoring:PublicationCountReport;
      mu:uuid {{toUuidLiteral this.uuid}};
      datamonitoring:targetClass {{uriToNode this.classUri}};
      skos:prefLabel {{toStringLiteral this.prefLabel}};
      datamonitoring:count "{{this.count}}"^^xsd:integer.
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

export const writeAdminUnitCountReportTemplate = Handlebars.compile(
  `\
{{prefixes}}
INSERT {
  GRAPH {{uriToNode reportGraphUri}} {
    {{uriToNode reportUri}} a datamonitoring:AdminUnitCountReport;
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

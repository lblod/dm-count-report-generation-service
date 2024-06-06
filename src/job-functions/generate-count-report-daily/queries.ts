import { compileSparql } from "../../handlebars/index.js";
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

export const countSessionsQueryTemplate = compileSparql(
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

export const countAgendaItemsQueryTemplate = compileSparql(
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
  FILTER(?plannedStart >= {{toDateTime from}})
  FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
}

`
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

export const countResolutionsQueryTemplate = compileSparql(
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
  FILTER(?plannedStart >= {{toDateTime from}})
  FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
}

`
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

export const countVoteQueryTemplate = compileSparql(
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
  FILTER(?plannedStart >= {{toDateTime from}})
  FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
}

`
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

export const writeCountReportQueryTemplate = compileSparql(
  `\
{{prefixes}}
INSERT {
  GRAPH {{uriToNode reportGraphUri}} {
    {{uriToNode reportUri}} a datamonitoring:GoverningBodyCountReport;
      datamonitoring:createdAt {{toDateTime createdAt}};
      datamonitoring:day {{toDate day}};
      datamonitoring:targetAdministrativeUnit {{uriToNode adminUnitUri}};
      datamonitoring:targetGoverningBody {{uriToNode govBodyUri}};
      skos:prefLabel {{toString prefLabel}};
      mu:uuid {{toUuid uuid}};
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:publicationCountReports
        {{#each counts}}{{uriToNode this.countUri}}{{#unless @last}},{{/unless}}{{/each}}.

    {{#each counts}}
    {{uriToNode this.countUri}} a datamonitoring:PublicationCountReport;
      mu:uuid {{toUuid this.uuid}};
      datamonitoring:targetClass {{uriToNode this.classUri}};
      skos:prefLabel {{toString this.prefLabel}};
      datamonitoring:count {{toInteger this.count}}.
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

export const writeAdminUnitCountReportTemplate = compileSparql(
  `\
{{prefixes}}
INSERT {
  GRAPH {{uriToNode reportGraphUri}} {
    {{uriToNode reportUri}} a datamonitoring:AdminUnitCountReport;
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

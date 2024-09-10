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
      besluit:isGehoudenDoor {{toNode governingBodyUri}}.
  } UNION {
    ?session a besluit:Zitting;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
        mandaat:isTijdspecialisatieVan {{toNode governingBodyUri}}.
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
      besluit:isGehoudenDoor {{toNode governingBodyUri}}.
  } UNION {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
      mandaat:isTijdspecialisatieVan {{toNode governingBodyUri}}.
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
      besluit:isGehoudenDoor {{toNode governingBodyUri}}.
  } UNION {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor ?governingBodyTimeSpecified.

    ?governingBodyTimeSpecified a besluit:Bestuursorgaan;
      mandaat:isTijdspecialisatieVan {{toNode governingBodyUri}}.
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
?zitting a besluit:Zitting ;
           besluit:isGehoudenDoor ?
{{toNode governingBodyUri}} ;
           besluit:behandelt ?agendapunt .
 ?behandeling a besluit:BehandelingVanAgendapunt ;
               dcterms:subject ?agendapunt ;
               besluit:heeftStemming ?vote .

  ?zitting besluit:geplandeStart ?plannedStart.

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
  GRAPH {{toNode reportGraphUri}} {
    {{toNode reportUri}} a datamonitoring:GoverningBodyCountReport;
      datamonitoring:createdAt {{toDateTime createdAt}};
      datamonitoring:day {{toDate day}};
      datamonitoring:targetAdministrativeUnit {{toNode adminUnitUri}};
      datamonitoring:targetGoverningBody {{toNode govBodyUri}};
      skos:prefLabel {{toString prefLabel}};
      mu:uuid {{toUuid uuid}};
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:publicationCountReports
        {{#each counts}}{{toNode this.countUri}}{{#unless @last}},{{/unless}}{{/each}}.

    {{#each counts}}
    {{toNode this.countUri}} a datamonitoring:PublicationCountReport;
      mu:uuid {{toUuid this.uuid}};
      datamonitoring:targetClass {{toNode this.classUri}};
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
  GRAPH {{toNode reportGraphUri}} {
    {{toNode reportUri}} a datamonitoring:AdminUnitCountReport;
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

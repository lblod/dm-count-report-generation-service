import Handlebars from "handlebars";
import "./../helpers/index.js"; // Making sure the modules in the helpers folder are loaded before these templates are compiled
import { DateOnly, DateTime } from "../util/date-time.js";

export type TestQueryInput = Record<string, never>;
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
  label: string | string[]; // Some org seem to have 2 labels's...
  id: string | string[]; // Some org seem to have 2 ID's...
};

export const getOrganisationsTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT ?organisationUri ?label ?id WHERE {
  GRAPH <{{graphUri}}> {
    {
      SELECT ?organisationUri WHERE {
        ?organisationUri a besluit:Bestuurseenheid;
        org:classification <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001>.
      } {{limitClause limit}}
    }
    ?organisationUri mu:uuid ?id;
      skos:prefLabel ?label.
  }
}
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
  classLabel: string;
};

export const getGoverningBodiesOfAdminUnitTemplate = Handlebars.compile(
  `\
{{prefixes}}
SELECT ?goveringBodyUri ?classLabel WHERE {
  GRAPH <{{graphUri}}> {
    ?goveringBodyUri a besluit:Bestuursorgaan;
      besluit:bestuurt <{{adminitrativeUnitUri}}>;
      org:classification [
        a skos:Concept;
        skos:prefLabel ?classLabel;
      ].
  }
}
`,
  { noEscape: true }
);

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
      skos:prefLabel "{{escape prefLabel}}";
      mu:uuid "{{uuid}}";
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:counts
      {{#each counts}}
        [
          a datamonitoring:Count;
          datamonitoring:targetClass <{{this.classUri}}>;
          datamonitoring:count {{this.count}};
          skos:prefLabel "{{escape this.prefLabel}}";
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
  GRAPH <{{reportGraphUri}}> {
    <{{reportUri}}> a datamonitoring:AdminUnitCountReport;
      skos:prefLabel "{{escape prefLabel}}";
      datamonitoring:targetAdminitrativeUnit <{{adminUnitUri}}>;
      datamonitoring:createdAt {{toDateTimeLiteral createdAt}};
      datamonitoring:day {{toDateLiteral day}};
      mu:uuid "{{uuid}}";
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

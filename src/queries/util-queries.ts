import { compileSparql } from "../handlebars/index.js";

export type TestQueryInput = Record<string, never>;
export type TestQueryOutput = {
  result: number;
};

export const testQueryTemplate = compileSparql(
  `\
SELECT (1+1 as ?result) WHERE {}
`
);

export type GetOrganisationsInput = {
  prefixes: string;
  graphUri: string;
  adminUnitSelection: string[] | undefined;
};

export type GetOrganisationsOutput = {
  organisationUri: string;
  label: string | string[]; // Some org seem to have 2 labels's...
  id: string | string[]; // Some org seem to have 2 ID's...
};

export const getOrganisationsTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?organisationUri ?label ?id WHERE {
  {{#if (listPopulated adminUnitSelection)}}
  VALUES ?organisationUri {
    {{#each adminUnitSelection}}
    {{toNode this}}
    {{/each}}
  }
  {{/if}}
  GRAPH {{toNode graphUri}} {
    {{#unless (listPopulated adminUnitSelection)}}
    {
      SELECT ?organisationUri WHERE {
        ?organisationUri a besluit:Bestuurseenheid;
        org:classification <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001>.
      }
    }
    {{/unless}}
    ?organisationUri mu:uuid ?id;
      skos:prefLabel ?label.
  }
}
`
);

export type CountInput = {
  prefixes: string;
  classes: readonly string[];
};

export const getCountForOrgQueryTemplate = compileSparql(
  `\
{{prefixes}}
SELECT * WHERE {
  {{#each classes}}
  {
    SELECT (COUNT(DISTINCT ?res{{@index}}) as ?resCount{{@index}}) WHERE {
      ?res{{@index}} a {{toNode this}}.
    }
  }
  {{/each}}
}
`
);

export type GetGoveringBodiesInput = {
  prefixes: string;
  adminitrativeUnitUri: string;
  graphUri: string;
};

export type GetGoveringBodiesOutput = {
  abstractGoverningBodyUri: string;
  classLabel: string;
};

export const getGoverningBodiesOfAdminUnitTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?abstractGoverningBodyUri ?timeSpecificGoveringBodyUri ?classLabel WHERE {
  GRAPH {{toNode graphUri}} {
    ?abstractGoverningBodyUri a besluit:Bestuursorgaan;
      besluit:bestuurt {{toNode adminitrativeUnitUri}};
      org:classification [
        a skos:Concept;
        skos:prefLabel ?classLabel
      ].

    ?timeSpecificGoveringBodyUri mandaat:isTijdspecialisatieVan ?abstractGoveringBodyUri.
  }
}
`
);

export type DeleteAllReportsInput = {
  prefixes: string;
  reportGraphUri: string;
};

export const deleteAllReportsTemplate = compileSparql(`\
{{prefixes}}

DELETE {
  GRAPH {{toNode reportGraphUri}} {
    ?res ?p ?o.
  }
} WHERE {
   VALUES ?class {
    datamonitoring:LastHarvestingExecutionReport
    datamonitoring:LastHarvestingExecutionRecord
    datamonitoring:GoverningBodyCountReport
    datamonitoring:PublicationCountReport
    datamonitoring:AdminUnitCountReport
    datamonitoring:GoverningBodyDocumentPresenceCheckReport
    datamonitoring:DocumentPresenceSessionCheck
    datamonitoring:DocumentPresenceAgendaItemCheck
    datamonitoring:AdminUnitDocumentPresenceCheckReport
  }
  GRAPH {{toNode reportGraphUri}} {
    ?res a ?class;
      ?p ?o.
  }
}

`);

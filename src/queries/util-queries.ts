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
  limit: number;
  graphUri: string;
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
  GRAPH {{toNode graphUri}} {
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
  goveringBodyUri: string;
  classLabel: string;
};

export const getGoverningBodiesOfAdminUnitTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?goveringBodyUri ?classLabel WHERE {
  GRAPH {{toNode graphUri}} {
    ?goveringBodyUri a besluit:Bestuursorgaan;
      besluit:bestuurt {{toNode adminitrativeUnitUri}};
      org:classification [
        a skos:Concept;
        skos:prefLabel ?classLabel;
      ].
  }
}
`
);

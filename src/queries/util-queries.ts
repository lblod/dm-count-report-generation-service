import Handlebars from "handlebars";
import "../helpers/index.js"; // Making sure the modules in the helpers folder are loaded before these templates are compiled

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
  GRAPH {{uriToNode graphUri}} {
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
      ?res{{@index}} a {{uriToNode this}}.
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
  GRAPH {{uriToNode graphUri}} {
    ?goveringBodyUri a besluit:Bestuursorgaan;
      besluit:bestuurt {{uriToNode adminitrativeUnitUri}};
      org:classification [
        a skos:Concept;
        skos:prefLabel ?classLabel;
      ].
  }
}
`,
  { noEscape: true }
);

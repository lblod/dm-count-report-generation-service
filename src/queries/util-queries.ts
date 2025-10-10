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
  classification: string;
};

export const getOrganisationsTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?organisationUri ?label ?id ?classification WHERE {
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
    ?organisationUri a besluit:Bestuurseenheid ;
                     org:classification ?classification .
    VALUES ?classification {
      <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001>
      <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000002>
      <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000000>
    }
  }
}
    {{/unless}}
    ?organisationUri mu:uuid ?id;
      skos:prefLabel ?label;
      org:classification ?classification.

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

export type GetGoverningBodiesInput = {
  prefixes: string;
  adminitrativeUnitUri: string;
  graphUri: string;
};

export type GetGoverningBodiesOutput = {
  abstractGoverningBodyUri: string;
  classLabel: string;
  timeSpecificGoverningBodyUri: string | string[];
};

export const getGoverningBodiesOfAdminUnitTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?abstractGoverningBodyUri ?timeSpecificGoverningBodyUri ?classLabel WHERE {
  GRAPH {{toNode graphUri}} {
    ?abstractGoverningBodyUri a besluit:Bestuursorgaan;
      besluit:bestuurt {{toNode adminitrativeUnitUri}};
      org:classification [
        a skos:Concept;
        skos:prefLabel ?classLabel
      ].

    ?timeSpecificGoverningBodyUri generiek:isTijdspecialisatieVan ?abstractGoverningBodyUri.
  }
}
`
);


export type GetGoverningBodiesFromHarvesterInput = {
  prefixes: string;
};

export type GetGoverningBodiesFromHarvesterOutput = {
  title:string;
};

export const GetGoverningBodiesFromHarvesterTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?title
WHERE {
  ?rdo <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#url> ?url;
       a <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#RemoteDataObject>.

  ?harvestingContainer <http://purl.org/dc/terms/hasPart> ?rdo.
  ?dataContainer <http://redpencil.data.gift/vocabularies/tasks/hasHarvestingCollection> ?harvestingContainer.
  ?scheduledTask <http://redpencil.data.gift/vocabularies/tasks/inputContainer> ?dataContainer;
                 a <http://redpencil.data.gift/vocabularies/tasks/ScheduledTask>;
                 <http://purl.org/dc/terms/isPartOf> ?scheduledJob.
  ?scheduledJob a <http://vocab.deri.ie/cogs#ScheduledJob>;
                <http://purl.org/dc/terms/title> ?title;
                <http://redpencil.data.gift/vocabularies/tasks/schedule>/<http://schema.org/repeatFrequency> ?cronExpr.
}

`
);

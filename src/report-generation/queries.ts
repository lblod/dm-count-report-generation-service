import Handlebars from "handlebars";
import { config } from "configuration";
import { DateOnly } from "date";
import "helpers"; // Make sure the modules in the helpers folder are loaded before these templates are compiled

export type GetOrganisationsInput = {
  prefixes: string;
  limit: number;
}

export type GetOrganisationsOutput = {
  organisationUri: string;
  label: string;
  id: string;
}

export const getOrganisationsTemplate = Handlebars.compile(`\
{{prefixes}}
SELECT ?organisationUri ?label ?id WHERE {
  ?organisationUri a besluit:Bestuurseenheid;
    mu:uuid ?id;
    skos:prefLabel ?label;
    org:classification <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001>.
} {{limitClause limit}}
`, {noEscape:true});


export type CountInput = {
  prefixes: string;
  classes: readonly string[];
}

export const getCountForOrgQueryTemplate = Handlebars.compile(`\
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
`, {noEscape:true})

export type GetGoveringBodiesInput = {
  prefixes: string,
  adminitrativeUnitUri: string,
};

export type GetGoveringBodiesOutput = {
  goveringBody: string;
  label: string;
}

export const getGoverningBodiesOfAdminUnitTemplate = Handlebars.compile(`\
{{prefixes}}
SELECT ?goveringBody ?label WHERE {
  ?goveringBody a besluit:Bestuursorgaan;
    besluit:bestuurt <{{adminitrativeUnitUri}}>;
    skos:prefLabel ?label.
}
`, {noEscape:true})

export type WriteReportInput = {
  prefixes: string,
  reportGraphUri: string,
  newUuid: string,
  createdAt: DateOnly,
  govBodyUri: string,
  counts: {
    classUri: string;
    count: number;
  }[],
}

export const writeCountReportQueryTemplate = Handlebars.compile(`\
{{prefixes}}
INSERT {
  GRAPH <{{reportGraphUri}}> {
    <http://lblod.data.gift/vocabularies/datamonitoring/countReport/{{newUuid}}> a datamonitoring:GoverningBodyCountReport;
      datamonitoring:createdAt {{toDateLiteral createdAt}};
      datamonitoring:governingBody <{{govBodyUri}}>;
      datamonitoring:istest "true"^^xsd:boolean;
      datamonitoring:counts
      {{#each counts}}
        [
          datamonitoring:countedClass <{{this.classUri}}>;
          datamonitoring:count: {{this.count}}
        ]{{#unless @last}},{{/unless}}
     {{/each}}
  }
} WHERE {

}
`, {noEscape: true})

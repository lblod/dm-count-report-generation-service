import Handlebars from "handlebars";
import { queryEngine } from "./query-engine";
import { EncapsulatedQuery, PrefixesInput } from "./util";
import { config } from "configuration";

export const getOrganisationsTemplate = Handlebars.compile(`\
{{prefixes}}
SELECT ?label ?id WHERE {
  ?org a besluit:Bestuurseenheid;
    mu:uuid ?id;
    skos:prefLabel ?label;
    org:classification <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001>.
} LIMIT 1000
`, {noEscape:true})

export const getOrganisationsQuery = new EncapsulatedQuery<PrefixesInput,{id: string; label: string;}>(
  queryEngine,
  config.env.ADMIN_UNIT_ENDPOINT,
  getOrganisationsTemplate,
);

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





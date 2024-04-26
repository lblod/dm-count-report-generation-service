import Handlebars from "handlebars";
import { queryEngine } from "./query-engine";
import { EncapsulatedQuery, PrefixesInput } from "./util";
import config from "../config";

export const PREFIXES = `\
PREFIX besluittype: <https://data.vlaanderen.be/id/concept/BesluitType/>
PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
PREFIX dct: <http://purl.org/dc/terms/>
PREFIX prov: <http://www.w3.org/ns/prov#>
PREFIX nie: <http://www.semanticdesktop.org/ontologies/2007/01/19/nie#>
PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
PREFIX oslc: <http://open-services.net/ns/core#>
PREFIX cogs: <http://vocab.deri.ie/cogs#>
PREFIX adms: <http://www.w3.org/ns/adms#>
PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
PREFIX dbpedia: <http://dbpedia.org/resource/>
PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
PREFIX besluitvor: <https://data.vlaanderen.be/ns/besluitvorming#>
PREFIX generiek: <https://data.vlaanderen.be/ns/generiek#>
PREFIX dossier: <https://data.omgeving.vlaanderen.be/ns/dossier#>
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX eurm8g: <http://data.europa.eu/m8g/>
PREFIX locn: <http://www.w3.org/ns/locn#>
PREFIX eli: <http://data.europa.eu/eli/ontology#>
PREFIX sh: <http://www.w3.org/ns/shacl#>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
PREFIX harvesting: <http://lblod.data.gift/vocabularies/harvesting/>
PREFIX deltas: <http://redpencil.data.gift/vocabularies/deltas/Error>
PREFIX leidinggevenden: <http://data.lblod.info/vocabularies/leidinggevenden/>
PREFIX vlaanderenconcept: <https://data.vlaanderen.be/id/concept/>
PREFIX lblodbesluit: <http://lblod.data.gift/vocabularies/besluit/>
PREFIX lblodeditor: <http://lblod.data.gift/vocabularies/editor/>
PREFIX vlaanderenmobiliteit: <https://data.vlaanderen.be/ns/mobiliteit#>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX rdfa: <http://www.w3.org/ns/rdfa#>
PREFIX xhv: <http://www.w3.org/1999/xhtml/vocab#>
`



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





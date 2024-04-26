import Handlebars from "handlebars";
import { queryEngine } from "./query-engine";
import { TemplatedQuery, PrefixesInput } from "./util";
import { config } from "configuration";
import { Dayjs } from "dayjs";
import { DateOnly } from "date";
import "helpers/toDateLiteral";

export const getOrganisationsTemplate = Handlebars.compile(`\
{{prefixes}}
SELECT ?label ?id WHERE {
  ?org a besluit:Bestuurseenheid;
    mu:uuid ?id;
    skos:prefLabel ?label;
    org:classification <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001>.
} LIMIT 1000
`, {noEscape:true})

export const getOrganisationsQuery = new TemplatedQuery<PrefixesInput,{id: string; label: string;}>(
  queryEngine,
  config.env.ADMIN_UNIT_ENDPOINT,
  getOrganisationsTemplate,
);

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

config.env.REPORT_GRAPH_URI

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

// export const writeCountReportQueryTemplate = Handlebars.compile(`\
// {{prefixes}}
// INSERT DATA {
//   GRAPH <{{reportGraphUri}}> {
//     <http://lblod.data.gift/vocabularies/datamonitoring/countReport/{{newUuid}}> a datamonitoring:GoverningBodyCountReport;
//       datamonitoring:createdAt {{toDateLiteral createdAt}};
//       datamonitoring:governingBody <{{govBodyUri}}>;
//       datamonitoring:counts
//       {{#each counts}}
//         [
//           datamonitoring:countedClass <{{this.classUri}}>;
//           datamonitoring:count: {{this.count}}
//         ]{{#unless @last}},{{/unless}}
//      {{/each}}
//   }
// }
// `, {noEscape: true})

export const writeCountReportQueryTemplate = Handlebars.compile(`\
{{prefixes}}
INSERT DATA {
  GRAPH <{{reportGraphUri}}> {
    <http://lblod.data.gift/vocabularies/datamonitoring/countReport/{{newUuid}}> a datamonitoring:GoverningBodyCountReport;
      datamonitoring:createdAt {{toDateLiteral createdAt}};
      datamonitoring:governingBody <{{govBodyUri}}>.
  }
}
`, {noEscape: true})




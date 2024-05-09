import { DateOnly, TimeOnly } from "util/date-time.js";
import { TemplatedSelect } from "./templated-query.js";
import { queryEngine } from "./query-engine.js";
import Handlebars, { log } from 'handlebars';
import { PREFIXES } from "local-constants.js";
import { logger } from "logger.js";

type MySelectQueryInput = {
  prefixes: string;
  classUri: string;
  day: DateOnly;
};

type MySelectQueryOutput = {
  resourceUri: string;
  label: string;
  timeOfDay: TimeOnly;
};

const mySelectQueryTemplate = Handlebars.compile(`\
{{prefixes}}

SELECT ?resourceUri ?label WHERE {
  ?resourceUri a <{{classUri}}>;
    skos:prefLabel ?label;
    example:day {{toDateLiteral day}};
    example:time ?time.
}
`, { noEscape:true });

const mySelectQuery = new TemplatedSelect<
  MySelectQueryInput, // Input type parameter
  MySelectQueryOutput // Output type parameter
>(
  queryEngine, // The comunica query engine (look at source)
  'http://localhost:8890/sparql', // URL of endpoint; typically ending in '/sparql'
  mySelectQueryTemplate, // The handlebars template you exported earlier
);

const result = await mySelectQuery.objects('resourceUri', {
  prefixes: PREFIXES,
  classUri: 'http://whatever.com/ns/examples/classes/Example',
  day: DateOnly.yesterday(),
});

const first = await mySelectQuery.result({
  prefixes: PREFIXES,
  classUri: 'http://whatever.com/ns/examples/classes/Example',
  day: DateOnly.yesterday(),
})

mySelectQuery.



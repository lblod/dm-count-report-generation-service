import { DateOnly, DateTime } from "../../util/date-time.js";
import { compileSparql } from "../../handlebars/index.js";

// Get last maturity level of a notule
export type GetMaturityLevelInput = {
  prefixes: string;
  governingBodyUri: string;
};

export type GetMaturityLevelOutput = {
  notuleUri: string;
  governingBodyUri: string;
  plannedStart: DateTime;
  adminUnitId: string;
};

export const getMaturityLevelTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?notuleUri ?plannedStart ?governingBodyUri WHERE {
?zitting a besluit:Zitting ;
    besluit:isGehoudenDoor {{toNode governingBodyUri}},?governingBodyUri;
    besluit:heeftNotulen ?notuleUrl;
    besluit:geplandeStart ?plannedStart .
  ?notuleUrl prov:wasDerivedFrom ?notuleUri .
}
  ORDER BY DESC(?plannedStart)
  LIMIT 1
`
);

// Insert last maturity level of a notule
export type InsertMaturityLevelInput = {
  prefixes: string;
  reportGraphUri: string;
  reportUri: string;
  day: DateOnly;
  prefLabel: string;
  createdAt: DateTime;
  uuid: string;
  notuleUri: string;
};

// This handlebars query is not robust when the times array is empty. Then it will generate a bad syntax.
export const insertMaturityLevelTemplate = compileSparql(
  `\
{{prefixes}}
INSERT {
  GRAPH {{toNode reportGraphUri}} {
    {{toNode reportUri}} a datamonitoring:MaturityLevelReport;
      datamonitoring:day {{toDate day}};
      skos:prefLabel {{toString prefLabel}};
      datamonitoring:createdAt {{toDateTime createdAt}};
      mu:uuid {{toUuid uuid}};
      datamonitoring:notuleUri {{toString notuleUri}} .
  }
} WHERE {

}
`
);

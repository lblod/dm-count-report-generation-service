import { DateOnly, DateTime } from "../../util/date-time.js";
import { compileSparql } from "../../handlebars/index.js";

// Get last maturity level of a notule
export type GetMaturityLevelInput = {
  prefixes: string;
  governingBodies: string[];
};

export type GetMaturityLevelOutput = {
  wasDerivedFrom: string;
  plannedStart: DateTime;
  adminUnitId: string;
  adminUnitLabel: string;
  classification: string;
};

export const getMaturityLevelTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?wasDerivedFrom ?plannedStart WHERE {
?zitting a besluit:Zitting ;
    besluit:isGehoudenDoor ?isGehoudenDoor ;
    besluit:heeftNotulen ?notuleUrl;
    besluit:geplandeStart ?plannedStart .

    FILTER (?isGehoudenDoor IN (
        {{#each governingBodies}}
          {{toNode this}}{{#unless @last}},{{/unless}}
        {{/each}}
      ))
  { ?zitting besluit:heeftBesluitenlijst ?url }
  UNION
  { ?zitting besluit:heeftNotulen ?url }
  UNION
  { ?zitting besluit:heeftUittreksel ?url }

   OPTIONAL { ?url <http://www.w3.org/ns/prov#wasDerivedFrom> ?wasDerivedFrom  }
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

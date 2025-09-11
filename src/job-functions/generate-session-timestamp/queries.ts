import { DateOnly, DateTime } from "../../util/date-time.js";
import { compileSparql } from "../../handlebars/index.js";
import { AdminUnitRecord } from "../../job/get-org-data.js";

// Get last session timestamp of a session
export type SessionTimestampRecord = { adminUnit: AdminUnitRecord, firstSession: DateTime, lastSession: DateTime }
export type GetSessionTimestampInput = {
  prefixes: string;
  governingBodies: string[];
};

export type GetSessionTimestampOutput = {
  governingBodyUri: string;
  firstSession: DateTime;
  lastSession: DateTime;
};

export const getSessionTimestampTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?firstSession ?lastSession WHERE {
  {
    SELECT ?governingBodyUri (MIN(?start) AS ?firstSession) (MAX(?start) AS ?lastSession) WHERE {
      ?session a besluit:Zitting;
                besluit:isGehoudenDoor ?isGehoudenDoor;
              besluit:geplandeStart ?start.

      FILTER (?isGehoudenDoor IN (
        {{#each governingBodies}}
          {{toNode this}}{{#unless @last}},{{/unless}}
        {{/each}}
      ))

    }


    GROUP BY ?governingBodyUri
  }
}
`
);

// Insert last session timestamp of a session
export type InsertSessionTimestampInput = {
  prefixes: string;
  reportGraphUri: string;
  reportUri: string;
  day: DateOnly;
  prefLabel: string;
  createdAt: DateTime;
  uuid: string;
  firstSession: DateTime;
  lastSession: DateTime;
};

export const insertSessionTimestampTemplate = compileSparql(
  `\
{{prefixes}}
INSERT {
  GRAPH {{toNode reportGraphUri}} {
    {{toNode reportUri}} a datamonitoring:SessionTimestampReport ;
      datamonitoring:day {{toDate day}} ;
      skos:prefLabel {{toString prefLabel}} ;
      datamonitoring:createdAt {{toDateTime createdAt}} ;
      mu:uuid {{toUuid uuid}} ;
      datamonitoring:firstSession {{toDateTime firstSession}} ;
      datamonitoring:lastSession {{toDateTime lastSession}} .
  }
} WHERE {

}
`
);

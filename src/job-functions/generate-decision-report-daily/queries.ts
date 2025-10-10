import { DateOnly, DateTime } from '../../util/date-time.js';
import { compileSparql } from '../../handlebars/index.js';
import { AdminUnitRecord } from '../../job/get-org-data.js';

export type GetDecisionInput = {
  prefixes: string;
  governingBodyUris: string[];
  from: DateTime;
  to: DateTime;
  noFilterForDebug: boolean;
};

export type GetDecisionOutput = {
  count: number;
  adminUnit: AdminUnitRecord;
  classLabel: string;
};

export const getDecisionTemplate = compileSparql(
  `\
  {{prefixes}}
SELECT (COUNT(DISTINCT ?resolution) as ?count) WHERE {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor ?isgehoudenDoor.

  ?agendaItem a besluit:Agendapunt.
  ?session besluit:geplandeStart ?plannedStart.

  ?agendaItemHandling a besluit:BehandelingVanAgendapunt;
    dct:subject ?agendaItem;
    prov:generated ?resolution.

  ?resolution a besluit:Besluit .

    FILTER (?isgehoudenDoor IN (
    {{#each governingBodyUris}}
      {{toNode this}}{{#unless @last}},{{/unless}}
    {{/each}}

  {{#unless noFilterForDebug}}
    FILTER(?plannedStart >= {{toDateTime from}})
    FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
  ))
}
  LIMIT 1
`
);

export type InsertDecisionInput = {
  prefixes: string;
  reportGraphUri: string;
  reportUri: string;
  adminUnitUri: string;
  day: DateOnly;
  prefLabel: string;
  createdAt: DateTime;
  uuid: string;
  classLabel: string;
  count: number;
};

export const insertDecisionTemplate = compileSparql(
  `\
{{prefixes}}
INSERT {
  GRAPH {{toNode reportGraphUri}} {
    {{toNode reportUri}} a datamonitoring:DecisionReport;
      datamonitoring:createdAt {{toDateTime createdAt}};
      datamonitoring:day {{toDate day}};
      datamonitoring:targetAdministrativeUnit {{toNode adminUnitUri}};
      datamonitoring:classLabel {{toString classLabel}};
      skos:prefLabel {{toString prefLabel}};
      mu:uuid {{toUuid uuid}};
      datamonitoring:count {{toInteger count}}
  }
} WHERE {
}
`
);

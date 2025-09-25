import { compileSparql } from "../../../handlebars/index.js";
import { DateTime } from "../../../util/date-time.js";

export type CountAgendaItemsQueryInput = {
  prefixes: string;
  from: DateTime;
  to: DateTime;
  noFilterForDebug: boolean;
  bestuursorganen?: string[];
};

export type CountAgendaItemsQueryOutput = {
  count: number;
};

export const countAgendaItemsQueryTemplate = compileSparql(`\
{{prefixes}}

SELECT (COUNT(DISTINCT ?agendapunt) AS ?count) WHERE {
  ?zitting a besluit:Zitting ;
           besluit:isGehoudenDoor   ?isgehoudenDoor ;
           besluit:behandelt ?agendapunt .

  FILTER (?isgehoudenDoor IN (
    {{#each bestuursorganen}}
      {{toNode this}}{{#unless @last}},{{/unless}}
    {{/each}}
  ))

   {{#unless noFilterForDebug}}
      FILTER(?plannedStart >= {{toDateTime from}})
      FILTER(?plannedStart < {{toDateTime to}})
    {{/unless}}
}
`);

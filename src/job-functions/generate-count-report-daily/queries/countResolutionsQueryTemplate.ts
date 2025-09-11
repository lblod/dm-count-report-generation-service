import { compileSparql } from "../../../handlebars/index.js";
import { DateTime } from "../../../util/date-time.js";

export type CountAgendaItemsQueryInput = {
  prefixes: string;
  from: DateTime;
  to: DateTime;
  noFilterForDebug: boolean;
  bestuursorganen?: string | string[];
  orgaan?: string[];
};

export type CountResolutionsQueryTemplate = {
  count: number;
};

export const countAgendaItemsQueryTemplate = compileSparql(`\
{{prefixes}}
SELECT (COUNT(DISTINCT ?resolution) as ?count) WHERE {
    ?session a besluit:Zitting;
      besluit:behandelt ?agendaItem;
      besluit:isGehoudenDoor ?isGehoudenDoor.

  ?agendaItem a besluit:Agendapunt.
  ?session besluit:geplandeStart ?plannedStart.

  ?agendaItemHandling a besluit:BehandelingVanAgendapunt;
    dct:subject ?agendaItem;
    prov:generated ?resolution.

  ?resolution a besluit:Besluit;
    eli:date_publication ?datePublication.

  FILTER (?isGehoudenDoor IN (
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

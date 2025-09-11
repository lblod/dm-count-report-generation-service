import { compileSparql } from "../../../handlebars/index.js";

export const countAgendaItemsWithoutTitleQueryTemplate = compileSparql(`\
{{prefixes}}

  SELECT (COUNT(DISTINCT ?agendaItem) AS ?count)
  WHERE {
  ?zitting a besluit:Zitting ;
          besluit:behandelt ?agendaItem;
          besluit:geplandeStart ?plannedStart;
          besluit:isGehoudenDoor ?isgehoudenDoor.
    ?agendaItem a besluit:Agendapunt .

  FILTER NOT EXISTS {
    ?agendaItem dcterms:title ?title .
  }

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

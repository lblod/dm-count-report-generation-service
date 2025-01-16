import { compileSparql } from "../../../handlebars/index.js";

export const countAgendaItemsWithTitleQueryTemplate = compileSparql(`\
{{prefixes}}

  SELECT (COUNT(?agendaItem) AS ?count)
  WHERE {
  ?zitting a besluit:Zitting ;
          besluit:behandelt ?agendaItem;
          besluit:geplandeStart ?plannedStart;
          besluit:isGehoudenDoor {{toNode governingBodyUri}}.
    ?agendaItem a besluit:Agendapunt ;
                dcterms:title ?title .

  {{#unless noFilterForDebug}}
    FILTER(?plannedStart >= {{toDateTime from}})
    FILTER(?plannedStart < {{toDateTime to}})
  {{/unless}}
  }
`);

import { compileSparql } from "../../../handlebars/index.js";

export const countAgendaItemsWithTitleQueryTemplate = compileSparql(`\
{{prefixes}}

SELECT ?title (COUNT(?agendaItem) AS ?count)
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
GROUP BY ?title
HAVING (COUNT(?agendaItem) > 1)
ORDER BY DESC(?count)
`);

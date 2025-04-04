import { compileSparql } from "../../../handlebars/index.js";

export const countAgendaItemsWithoutDescriptionQueryTemplate = compileSparql(`\
  {{prefixes}}

    SELECT (COUNT(DISTINCT ?agendaItem) AS ?count)
    WHERE {
    ?zitting a besluit:Zitting ;
            besluit:behandelt ?agendaItem;
            besluit:geplandeStart ?plannedStart;
            besluit:isGehoudenDoor {{toNode governingBodyUri}}.
      ?agendaItem a besluit:Agendapunt .

    FILTER NOT EXISTS {
      ?agendaItem dcterms:description ?description .
    }

    {{#unless noFilterForDebug}}
      FILTER(?plannedStart >= {{toDateTime from}})
      FILTER(?plannedStart < {{toDateTime to}})
    {{/unless}}
    }
  `);
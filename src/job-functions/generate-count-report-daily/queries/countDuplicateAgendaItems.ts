import { compileSparql } from '../../../handlebars/index.js';

export const countDuplicateAgendaItemsQueryTemplate = compileSparql(`\
{{prefixes}}

SELECT (SUM(?countAgendaItems) AS ?count)
WHERE {
  {
    SELECT ?agendaTitel (COUNT(DISTINCT ?agendaItem) AS ?countAgendaItems)
    WHERE {
      FILTER (?isgehoudenDoor IN (
        {{#each bestuursorganen}}
          {{toNode this}}{{#unless @last}},{{/unless}}
        {{/each}}
      ))

      ?zitting a besluit:Zitting ;
               besluit:isGehoudenDoor ?isgehoudenDoor ;
               besluit:behandelt ?agendaItem .

      ?agendaItem a besluit:Agendapunt ;
                  dcterms:title ?agendaTitel ;
                  prov:wasDerivedFrom ?doc .
    }
    GROUP BY ?agendaTitel
    HAVING (COUNT(DISTINCT ?doc) > 1)
  }
  FILTER (?countAgendaItems >= 2)
}


`);

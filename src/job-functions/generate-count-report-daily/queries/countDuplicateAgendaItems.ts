import { compileSparql } from "../../../handlebars/index.js";

export const countDuplicateAgendaItemsQueryTemplate = compileSparql(`\
{{prefixes}}

SELECT (COUNT(DISTINCT ?agendaItem1) as ?count)
where {
 ?zitting a besluit:Zitting ;
          besluit:behandelt ?agendaItem1, ?agendaItem2 ;
		  besluit:isGehoudenDoor {{toNode governingBodyUri}} .

  ?agendaItem1 dcterms:title ?agendaTitel ;
               prov:wasDerivedFrom ?doc1 .

  # A second agenda item has the same title
  ?agendaItem2 dcterms:title ?agendaTitel ;
               prov:wasDerivedFrom ?doc2 .

  FILTER (?agendaItem1 != ?agendaItem2)

  # The agenda items don't occur in the same document
  FILTER NOT EXISTS {
    ?agendaItem2 prov:wasDerivedFrom ?doc1 .
  }

  # The doc contains other agenda items (so no uittreksel)
  ?agendaItem3 a besluit:Agendapunt ;
               prov:wasDerivedFrom ?doc1 .
  FILTER (?agendaItem3 != ?agendaItem1)
  FILTER (?agendaItem3 != ?agendaItem2)

   # The doc contains other agenda items (so no uittreksel)
  ?agendaItem4 a besluit:Agendapunt ;
               prov:wasDerivedFrom ?doc2 .
  FILTER (?agendaItem4 != ?agendaItem1)
  FILTER (?agendaItem4 != ?agendaItem2)
}
`);

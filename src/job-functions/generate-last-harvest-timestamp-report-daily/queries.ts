import { DateOnly, DateTime } from '../../util/date-time.js';
import { compileSparql } from '../../handlebars/index.js';

export type GetLastModifiedInput = {
  prefixes: string;
};

export type GetLastModifiedOutput = {
  scheduledJobUri: string;
  title: string;
  lastModified: DateTime;
  status: string;
};

export const getLastModifiedTemplate = compileSparql(
  `\
{{prefixes}}
SELECT ?scheduledJob ?title ?status (MAX(?modified) AS ?lastModified)
WHERE {
  ?scheduledJob a cogs:ScheduledJob ;
                dct:title ?title .

  ?job dct:creator ?scheduledJob ;
       adms:status ?status ;
       dct:modified ?modified .

  FILTER(?status IN (
    <http://redpencil.data.gift/id/concept/JobStatus/success>,
    <http://redpencil.data.gift/id/concept/JobStatus/failed>
  ))
}
GROUP BY ?scheduledJob ?title ?status
`
);

export type HarvestingTimeStampResult = {
  resultUri: string;
  uuid: string;
  organisationUri: string;
  organisationLabel: string;
  organisationId: string;
  lastExecutionTimestamp: DateTime;
  status: string;
};

export type InsertLastExecutedReportInput = {
  prefixes: string;
  reportGraphUri: string;
  reportUri: string;
  day: DateOnly;
  prefLabel: string;
  createdAt: DateTime;
  uuid: string;
  times: HarvestingTimeStampResult[];
};

// This handlebars query is not robust when the times array is empty. Then it will generate a bad syntax.
export const insertLastExecutedReportTemplate = compileSparql(
  `\
{{prefixes}}
INSERT {
  GRAPH {{toNode reportGraphUri}} {
    {{toNode reportUri}} a datamonitoring:LastHarvestingExecutionReport;
      datamonitoring:day {{toDate day}};
      skos:prefLabel {{toString prefLabel}};
      datamonitoring:createdAt {{toDateTime createdAt}};
      mu:uuid {{toUuid uuid}} {{#unless times}}.{{else}};{{/unless}}
    {{#if times}}
     datamonitoring:adminUnitLastExecutionRecords
      {{#each times}}
        {{toNode this.resultUri}}{{#unless @last}},{{/unless}}
      {{/each}}.
      {{#each times}}
      {{toNode this.resultUri}}
        a datamonitoring:LastHarvestingExecutionRecord;
        mu:uuid {{toUuid this.uuid}};
        datamonitoring:targetAdministrativeUnit {{toNode this.organisationUri}};
        skos:prefLabel {{toString this.organisationLabel}};
        datamonitoring:lastExecutionTime {{toDateTime this.lastExecutionTimestamp}};
        datamonitoring:status {{toNode this.status}} .
      {{/each}}
    {{/if}}
  }
} WHERE {

}
`
);

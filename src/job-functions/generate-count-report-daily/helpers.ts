import { QueryEngine } from '@comunica/query-sparql';
import { TemplatedInsert, TemplatedSelect } from '../../queries/templated-query.js';
import {
  CountResolutionsQueryInput,
  CountResolutionsQueryOutput,
  countResolutionsQueryTemplate,
  CountSessionsQueryInput,
  CountSessionsQueryOutput,
  countSessionsQueryTemplate,
  CountVoteQueryInput,
  CountVoteQueryOutput,
  countVoteQueryTemplate,
  writeAdminUnitCountReportTemplate,
  WriteAdminUnitReportInput,
  writeCountReportQueryTemplate,
  WriteReportInput,
} from './queries.js';
import { countAgendaItemsQueryTemplate } from './queries/countAgendaItemsQueryTemplate.js';
import { countAgendaItemsWithoutDescriptionQueryTemplate } from './queries/countAgendaItemsWithoutDescriptionQueryTemplate.js';
import { countAgendaItemsWithoutTitleQueryTemplate } from './queries/countAgendaItemsWithoutTitleQueryTemplate.js';
import { countDuplicateAgendaItemsQueryTemplate } from './queries/countDuplicateAgendaItems.js';

export function getQueriesForWriting(queryEngine: QueryEngine, endpoint: string) {
  const writeCountReportQuery = new TemplatedInsert<WriteReportInput>(
    queryEngine,
    endpoint,
    writeCountReportQueryTemplate
  );
  const writeAdminUnitCountReportQuery = new TemplatedInsert<WriteAdminUnitReportInput>(
    queryEngine,
    endpoint,
    writeAdminUnitCountReportTemplate
  );
  return {
    writeCountReportQuery,
    writeAdminUnitCountReportQuery,
  };
}

export function getQueriesForAnalysis(queryEngine: QueryEngine, endpoint: string) {
  const countSessionsQuery = new TemplatedSelect<CountSessionsQueryInput, CountSessionsQueryOutput>(
    queryEngine,
    endpoint,
    countSessionsQueryTemplate
  );

  const countAgendaItemsQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countAgendaItemsQueryTemplate);

  const countAgendaItemsWithoutTitleQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countAgendaItemsWithoutTitleQueryTemplate);

  const countAgendaItemsWithoutDescriptionQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countAgendaItemsWithoutDescriptionQueryTemplate);

  const countResolutionsQuery = new TemplatedSelect<
    CountResolutionsQueryInput,
    CountResolutionsQueryOutput
  >(queryEngine, endpoint, countResolutionsQueryTemplate);

  const countVoteQuery = new TemplatedSelect<CountVoteQueryInput, CountVoteQueryOutput>(
    queryEngine,
    endpoint,
    countVoteQueryTemplate
  );

  const countDuplicateAgendaItemsQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countDuplicateAgendaItemsQueryTemplate);

  return {
    countSessionsQuery,
    countAgendaItemsQuery,
    countAgendaItemsWithoutTitleQuery,
    countAgendaItemsWithoutDescriptionQuery,
    countResolutionsQuery,
    countVoteQuery,
    countDuplicateAgendaItemsQuery,
  };
}

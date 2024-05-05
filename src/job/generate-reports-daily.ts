import { QueryEngine } from "@comunica/query-sparql";
import { CountResolutionsQueryInput, CountResolutionsQueryOutput, CountSessionsQueryInput, CountSessionsQueryOutput, CountVoteQueryInput, CountVoteQueryOutput, WriteAdminUnitReportInput, WriteReportInput, countAgendaItemsQueryTemplate, countResolutionsQueryTemplate, countSessionsQueryTemplate, countVoteQueryTemplate, writeAdminUnitCountReportTemplate, writeCountReportQueryTemplate } from "queries/queries.js";
import { TemplatedInsert, TemplatedSelect } from "queries/templated-query.js";

function getQueries(queryEngine: QueryEngine, endpoint: string) {
  const countSessionsQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countSessionsQueryTemplate);
  const countResolutionsQuery = new TemplatedSelect<
    CountResolutionsQueryInput,
    CountResolutionsQueryOutput
  >(queryEngine, endpoint, countResolutionsQueryTemplate);
  const writeCountReportQuery = new TemplatedInsert<WriteReportInput>(
    queryEngine,
    endpoint,
    writeCountReportQueryTemplate
  );
  const writeAdminUnitCountReportQuery =
  new TemplatedInsert<WriteAdminUnitReportInput>(
    queryEngine,
    endpoint,
    writeAdminUnitCountReportTemplate
  );
  const countAgendaItemsQuery = new TemplatedSelect<
  CountSessionsQueryInput,
  CountSessionsQueryOutput
  >(queryEngine, endpoint, countAgendaItemsQueryTemplate);
  const countVoteQuery = new TemplatedSelect<
  CountVoteQueryInput,
  CountVoteQueryOutput
>(queryEngine, endpoint, countVoteQueryTemplate);

  return {
    countSessionsQuery,
    countAgendaItemsQuery,
    countResolutionsQuery,
    countVoteQuery,
    writeCountReportQuery,
    writeAdminUnitCountReportQuery,
  };
}

export async function generateReportsDaily(
  logger:
)

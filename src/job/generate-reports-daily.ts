import { QueryEngine } from "@comunica/query-sparql";
import {
  CountResolutionsQueryInput,
  CountResolutionsQueryOutput,
  CountSessionsQueryInput,
  CountSessionsQueryOutput,
  CountVoteQueryInput,
  CountVoteQueryOutput,
  WriteAdminUnitReportInput,
  WriteReportInput,
  countAgendaItemsQueryTemplate,
  countResolutionsQueryTemplate,
  countSessionsQueryTemplate,
  countVoteQueryTemplate,
  writeAdminUnitCountReportTemplate,
  writeCountReportQueryTemplate,
} from "../queries/queries.js";
import {
  TemplatedInsert,
  TemplatedSelect,
} from "../queries/templated-query.js";
import { TaskFunction } from "./task.js";
import { getOrgResoucesCached } from "./get-org-data.js";
import { queryEngine } from "../queries/query-engine.js";
import { config } from "../configuration.js";
import { duration } from "../util/util.js";
import { PREFIXES } from "../local-constants.js";
import { DateOnly } from "../util/date-time.js";
import dayjs from "dayjs";
import { v4 as uuidv4 } from "uuid";

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

export const generateReportsDaily: TaskFunction = async (
  progress,
  day: DateOnly | undefined
) => {
  const defaultedDay = day ?? DateOnly.yesterday();
  progress.update(
    `Report function invoked with day ${defaultedDay.toString()}`
  );
  // Init some functions making use of the progress
  async function performCount<
    I extends Record<string, any>,
    O extends Record<string, any>
  >(resource: string, query: TemplatedSelect<I, O>, input: I): Promise<O> {
    const result = await duration(query.result.bind(query))(input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    progress.update(
      `Performed count query for resource "${resource}" in ${result.durationMilliseconds} ms.`
    );
    return result.result;
  }
  async function performInsert<I extends Record<string, any>>(
    resource: string,
    query: TemplatedInsert<I>,
    input: I
  ): Promise<void> {
    const result = await duration(query.execute.bind(query))(input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    progress.update(
      `Written '${resource}' in ${result.durationMilliseconds} ms`
    );
  }

  progress.update(`Getting org resources`);
  const orgResources = await getOrgResoucesCached(queryEngine);
  const governingBodiesCount = orgResources.adminUnits.reduce<number>(
    (acc, curr) => acc + curr.govBodies.length,
    0
  );
  const queryCount =
    orgResources.adminUnits.reduce<number>(
      (acc, curr) => acc + curr.govBodies.length * 5 + 1,
      0
    ) * config.file.length;
  progress.update(
    `Got org resources. ${queryCount} queries to perform for ${governingBodiesCount} governing bodies and ${orgResources.adminUnits.length} admin units for ${config.file.length} endpoints.`
  );
  let queries = 0;

  // Now perform the query machine gun
  for (const endpoint of config.file) {
    const {
      countSessionsQuery,
      countAgendaItemsQuery,
      countResolutionsQuery,
      countVoteQuery,
      writeCountReportQuery,
      writeAdminUnitCountReportQuery,
    } = getQueries(queryEngine, endpoint.url);

    for (const adminUnit of orgResources.adminUnits) {
      const governingBodyReportUriList: string[] = [];
      // TODO: make a catalog of query machines for each resource type eventually
      for (const goveringBody of adminUnit.govBodies) {
        // Count the resources
        const sessionsResult = await performCount(
          "Session",
          countSessionsQuery,
          {
            prefixes: PREFIXES,
            governingBodyUri: goveringBody.uri,
            from: defaultedDay.localStartOfDay,
            to: defaultedDay.localEndOfDay,
            noFilterForDebug: config.env.NO_TIME_FILTER,
          }
        );

        const agendaItemResult = await performCount(
          "AgendaPunt",
          countAgendaItemsQuery,
          {
            prefixes: PREFIXES,
            governingBodyUri: goveringBody.uri,
            from: defaultedDay.localStartOfDay,
            to: defaultedDay.localEndOfDay,
            noFilterForDebug: config.env.NO_TIME_FILTER,
          }
        );

        const resolutionResult = await performCount(
          "Besluit",
          countResolutionsQuery,
          {
            prefixes: PREFIXES,
            governingBodyUri: goveringBody.uri,
            from: defaultedDay.localStartOfDay,
            to: defaultedDay.localEndOfDay,
            noFilterForDebug: config.env.NO_TIME_FILTER,
          }
        );

        const voteResult = await performCount("Stemming", countVoteQuery, {
          prefixes: PREFIXES,
          governingBodyUri: goveringBody.uri,
          from: defaultedDay.localStartOfDay,
          to: defaultedDay.localEndOfDay,
          noFilterForDebug: config.env.NO_TIME_FILTER,
        });

        const reportUri = `http://lblod.data.gift/vocabularies/datamonitoring/countReport/${uuidv4()}`;
        governingBodyReportUriList.push(reportUri);

        // Write govering body report
        await performInsert("GoverningBodyCountReport", writeCountReportQuery, {
          prefixes: PREFIXES,
          govBodyUri: goveringBody.uri,
          createdAt: dayjs(),
          reportUri,
          reportGraphUri: config.env.REPORT_GRAPH_URI,
          adminUnitUri: adminUnit.uri,
          prefLabel: `Count report for governing body '${goveringBody.label}' on ${day}`,
          day: defaultedDay,
          counts: [
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Zitting`,
              count: sessionsResult.count,
              prefLabel: `Count of 'Zitting'`,
            },
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Agendapunt`,
              count: agendaItemResult.count,
              prefLabel: `Count of 'Agendapunt'`,
            },
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Besluit`,
              count: resolutionResult.count,
              prefLabel: `Count of 'Besluit'`,
            },
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Stemming`,
              count: voteResult.count,
              prefLabel: `Count of 'Stemming'`,
            },
          ],
        });
      }
      // Write admin unit report
      await performInsert(
        "AdminUnitCountReport",
        writeAdminUnitCountReportQuery,
        {
          prefixes: PREFIXES,
          reportGraphUri: config.env.REPORT_GRAPH_URI,
          adminUnitUri: adminUnit.uri,
          prefLabel: `Count report for admin unit '${adminUnit.label}' on ${day}`,
          reportUri: `http://lblod.data.gift/vocabularies/datamonitoring/countReport/${uuidv4()}`,
          createdAt: dayjs(),
          day: defaultedDay,
          reportUris: governingBodyReportUriList,
        }
      );
    }
    progress.update(`All reports written for endpoint "${endpoint.url}"`);
  }
};

import { config } from "./configuration.js";
import {
  GetGoveringBodiesInput,
  GetGoveringBodiesOutput,
  GetOrganisationsOutput,
  GetOrganisationsInput,
  WriteReportInput,
  getGoverningBodiesOfAdminUnitTemplate,
  getOrganisationsTemplate,
  writeCountReportQueryTemplate,
  countSessionsQueryTemplate,
  CountSessionsQueryInput,
  CountSessionsQueryOutput,
  countAgendaItemsQueryTemplate,
  CountResolutionsQueryInput,
  CountResolutionsQueryOutput,
  countResolutionsQueryTemplate,
  writeAdminUnitCountReportTemplate,
  WriteAdminUnitReportInput,
  CountVoteQueryInput,
  countVoteQueryTemplate,
  CountVoteQueryOutput,
} from "./report-generation/queries.js";
import { queryEngine } from "./report-generation/query-engine.js";
import { PREFIXES } from "./local-constants.js";
import { DateOnly } from "./date-util.js";
import {
  TemplatedInsert,
  TemplatedSelect,
  delay,
} from "./report-generation/util.js";
import { v4 as uuidv4 } from "uuid";
import dayjs from "dayjs";
import { QueryEngine } from "@comunica/query-sparql";
import logger from "logger.js";
import { progressEventEmitter, reportProgress } from "sse.js";
import { timingWrapper } from "util/util.js";

export async function generateReports(day: DateOnly) {
  //For every org query counts for all resource types
  reportProgress(0, 0, false, null, "Getting org resources");
  const orgResources = await getOrgResoucesCached();
  const governingBodiesCount = orgResources.adminUnits.reduce<number>(
    (acc, curr) => acc + curr.govBodies.length,
    0
  );
  const queryCount = orgResources.adminUnits.reduce<number>(
    (acc, curr) => acc + curr.govBodies.length * 5 + 1,
    0
  );
  logger.info(
    `Got organisations and govering bodies: ${orgResources.adminUnits.length} admin units and ${governingBodiesCount} governing bodies. Total amount of queries to be executed for report generation is ${queryCount}`
  );
  let progress = 0;
  reportProgress(progress, queryCount, false, null, "Report generation start");

  for (const endpoint of config.file) {
    const {
      countSessionsQuery,
      countAgendaItemsQuery,
      countResolutionsQuery,
      countVoteQuery,
      writeCountReportQuery,
      writeAdminUnitCountReportQuery,
    } = getQueries(queryEngine, endpoint.url);

    // Handy wrapper functions to take care of pesku logging and event emitting
    async function performCount<
      I extends Record<string, any>,
      O extends Record<string, any>
    >(resource: string, query: TemplatedSelect<I, O>, input: I): Promise<O> {
      const timed = await timingWrapper(query.result.bind(query), input);
      reportProgress(
        ++progress,
        queryCount,
        false,
        timed.durationMilliseconds,
        `Counted ${timed.result} '${resource}' in ${timed.durationMilliseconds} ms`
      );
      return timed.result;
    }
    async function performInsert<I extends Record<string, any>>(
      resource: string,
      query: TemplatedInsert<I>,
      input: I
    ): Promise<void> {
      const timed = await timingWrapper(query.execute.bind(query), input);
      reportProgress(
        ++progress,
        queryCount,
        false,
        timed.durationMilliseconds,
        `Written '${resource}' in ${timed.durationMilliseconds} ms`
      );
    }

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
            from: day.localStartOfDay,
            to: day.localEndOfDay,
            noFilterForDebug: config.env.NO_TIME_FILTER,
          }
        );

        const agendaItemResult = await performCount(
          "AgendaPunt",
          countAgendaItemsQuery,
          {
            prefixes: PREFIXES,
            governingBodyUri: goveringBody.uri,
            from: day.localStartOfDay,
            to: day.localEndOfDay,
            noFilterForDebug: config.env.NO_TIME_FILTER,
          }
        );

        const resolutionResult = await performCount(
          "Besluit",
          countResolutionsQuery,
          {
            prefixes: PREFIXES,
            governingBodyUri: goveringBody.uri,
            from: day.localStartOfDay,
            to: day.localEndOfDay,
            noFilterForDebug: config.env.NO_TIME_FILTER,
          }
        );

        const voteResult = await performCount("Stemming", countVoteQuery, {
          prefixes: PREFIXES,
          governingBodyUri: goveringBody.uri,
          from: day.localStartOfDay,
          to: day.localEndOfDay,
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
          day,
          counts: [
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Zitting`,
              count: sessionsResult.count,
            },
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Agendapunt`,
              count: agendaItemResult.count,
            },
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Besluit`,
              count: resolutionResult.count,
            },
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Stemming`,
              count: voteResult.count,
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
          day,
          reportUris: governingBodyReportUriList,
        }
      );
    }
  }
  reportProgress(
    queryCount,
    queryCount,
    true,
    null,
    "Function finished successfully"
  );
}

import { QueryEngine } from "@comunica/query-sparql";
import { v4 as uuidv4 } from "uuid";
import {
  AdminUnitRecord,
  getOrgResoucesCached,
  GoverningBodyRecord,
} from "../../job/get-org-data.js";
import { JobFunction } from "../../job/job.js";
import { PREFIXES } from "../../local-constants.js";
import { queryEngine } from "../../queries/query-engine.js";
import {
  TemplatedInsert,
  TemplatedSelect,
} from "../../queries/templated-query.js";
import { DateOnly, now } from "../../util/date-time.js";
import { duration } from "../../util/util.js";
import {
  WriteReportInput,
  writeCountReportQueryTemplate,
  WriteAdminUnitReportInput,
  writeAdminUnitCountReportTemplate,
  CountSessionsQueryInput,
  CountSessionsQueryOutput,
  countSessionsQueryTemplate,
  CountResolutionsQueryInput,
  CountResolutionsQueryOutput,
  countResolutionsQueryTemplate,
  countAgendaItemsQueryTemplate,
  CountVoteQueryInput,
  CountVoteQueryOutput,
  countVoteQueryTemplate,
  CountAgendaItemsQueryInput,
  CountAgendaItemsQueryOutput,
} from "./queries.js";
import { config, EndpointConfig } from "../../configuration.js";
import { countAgendaItemsWithTitleQueryTemplate } from "./queries/countAgendaItemsWithTitle.js";
import { countAgendaItemsWithDescriptionQueryTemplate } from "./queries/countAgendaItemsWithDescription.js";

type CountResult = {
  count: number;
};
type CountQueries = {
  countSessionsQuery: TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >;
  countAgendaItemsQuery: TemplatedSelect<
    CountAgendaItemsQueryInput,
    CountAgendaItemsQueryOutput
  >;
  countAgendaItemsWithTitleQuery: TemplatedSelect<
    CountAgendaItemsQueryInput,
    CountAgendaItemsQueryOutput
  >;
  countAgendaItemsWithDescriptionQuery: TemplatedSelect<
    CountAgendaItemsQueryInput,
    CountAgendaItemsQueryOutput
  >;
  countResolutionsQuery: TemplatedSelect<
    CountResolutionsQueryInput,
    CountResolutionsQueryOutput
  >;
  countVoteQuery: TemplatedSelect<CountVoteQueryInput, CountVoteQueryOutput>;
};
type Endpoint = {
  url: string;
};

function getQueriesForWriting(queryEngine: QueryEngine, endpoint: string) {
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
  return {
    writeCountReportQuery,
    writeAdminUnitCountReportQuery,
  };
}
function getQueriesForAnalysis(queryEngine: QueryEngine, endpoint: string) {
  const countSessionsQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countSessionsQueryTemplate);

  const countAgendaItemsQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countAgendaItemsQueryTemplate);

  const countAgendaItemsWithTitleQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countAgendaItemsWithTitleQueryTemplate);

  const countAgendaItemsWithDescriptionQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countAgendaItemsWithDescriptionQueryTemplate);

  const countResolutionsQuery = new TemplatedSelect<
    CountResolutionsQueryInput,
    CountResolutionsQueryOutput
  >(queryEngine, endpoint, countResolutionsQueryTemplate);

  const countVoteQuery = new TemplatedSelect<
    CountVoteQueryInput,
    CountVoteQueryOutput
  >(queryEngine, endpoint, countVoteQueryTemplate);

  return {
    countSessionsQuery,
    countAgendaItemsQuery,
    countAgendaItemsWithTitleQuery,
    countAgendaItemsWithDescriptionQuery,
    countResolutionsQuery,
    countVoteQuery,
  };
}

/**
 * Job function counting resources. This is a PoC.
 * @param progress Default progress object passed to any job function
 * @param day The day of the year this job needs to take into account. The report only takes into account the published resources of a single day. Default value is yesterday.
 */
export const generateReportsDaily: JobFunction = async (
  progress,
  day: DateOnly | undefined = undefined
) => {
  const defaultedDay = day ?? config.env.OVERRIDE_DAY ?? DateOnly.yesterday();
  if (!config.env.INITIAL_SYNC) {
    progress.update(
      `Report function invoked with day ${defaultedDay.toString()}`
    );
  }
  // Init some functions making use of the progress
  async function performCount<
    I extends Record<string, any>,
    O extends Record<string, any>
  >(resource: string, query: TemplatedSelect<I, O>, input: I): Promise<O> {
    const result = await duration(query.result.bind(query))(input);
    console.log(query.result.bind(query));
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
    ) * config.file.endpoints.length;
  progress.progress(0, queryCount);
  progress.update(
    `Got org resources. ${queryCount} queries to perform for ${governingBodiesCount} governing bodies and ${orgResources.adminUnits.length} admin units for ${config.file.endpoints.length} endpoints.`
  );
  let queries = 0;
  const { writeCountReportQuery, writeAdminUnitCountReportQuery } =
    getQueriesForWriting(queryEngine, config.env.REPORT_ENDPOINT);

  await writeAdminUnitReports(
    orgResources.adminUnits,
    config.file.endpoints,
    defaultedDay
  );

  async function performCountForGoverningBody(
    governingBody: GoverningBodyRecord,
    countQueries: CountQueries,
    defaultedDay: DateOnly
  ) {
    const results: Record<string, CountResult> = {};

    const {
      countSessionsQuery,
      countAgendaItemsQuery,
      countAgendaItemsWithTitleQuery,
      countAgendaItemsWithDescriptionQuery,
      countResolutionsQuery,
      countVoteQuery,
    } = countQueries;

    const countConfigs = [
      { type: "Session", query: countSessionsQuery, label: "Zitting" },
      { type: "AgendaPunt", query: countAgendaItemsQuery, label: "Agendapunt" },
      {
        type: "AgendapuntTitle",
        query: countAgendaItemsWithTitleQuery,
        label: "AgendapuntTitle",
      },
      {
        type: "AgendapuntDescription",
        query: countAgendaItemsWithDescriptionQuery,
        label: "AgendapuntDescription",
      },
      { type: "Besluit", query: countResolutionsQuery, label: "Besluit" },
      { type: "Stemming", query: countVoteQuery, label: "Stemming" },
    ];
    const noFilterForDebug = config.env.INITIAL_SYNC;
    for (const { type, query, label } of countConfigs) {
      results[label] = await performCount(type, query, {
        prefixes: PREFIXES,
        governingBodyUri: governingBody.uri,
        from: defaultedDay.localStartOfDay,
        to: defaultedDay.localEndOfDay,
        noFilterForDebug,
      });
    }

    return results;
  }

  async function insertGoverningBodyReport(
    governingBody: GoverningBodyRecord,
    adminUnit: AdminUnitRecord,
    results: Record<string, CountResult>,
    defaultedDay: DateOnly
  ): Promise<string> {
    const uuid = uuidv4();
    const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
    const result = Object.entries(results)
    .filter(([_, result]) => result.count !== 0);
    const uuids = new Array(result.length).fill(null).map(() => uuidv4());
    const counts = result
      .map(([label, result], index) => {
        return  {
        countUri: `${config.env.URI_PREFIX_RESOURCES}${uuids[index]}`,
        uuid: uuids[index],
        classUri: `http://data.vlaanderen.be/ns/besluit#${label}`,
        count: result.count,
        prefLabel: `Count of '${label}'`,
      }
    });
    if (counts && counts.length > 0) {
      await performInsert("GoverningBodyCountReport", writeCountReportQuery, {
        prefixes: PREFIXES,
        govBodyUri: governingBody.uri,
        createdAt: now(),
        reportUri,
        reportGraphUri: `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DMGEBRUIKER`,
        adminUnitUri: adminUnit.uri,
        prefLabel: `Count report for governing body of class '${governingBody.classLabel}' on ${defaultedDay} for admin unit '${adminUnit.label}'`,
        day: defaultedDay,
        uuid,
        counts,
      });
    }

    return reportUri;
  }

  async function processAdminUnitAcrossEndpoints(
    adminUnit: AdminUnitRecord,
    endpoints: Endpoint[],
    defaultedDay: DateOnly
  ): Promise<string[]> {
    const governingBodyReportUriList = [];

    for (const endpoint of endpoints) {
      const countQueries = getQueriesForAnalysis(queryEngine, endpoint.url);

      for (const governingBody of adminUnit.govBodies) {
        progress.update(
          `Counting for "${adminUnit.label}":"${governingBody.classLabel}". (${governingBody.uri})`
        );

        const results = await performCountForGoverningBody(
          governingBody,
          countQueries,
          defaultedDay
        );
        progress.update(
          `Sessions: ${results.Zitting.count}, Agendapunt: ${results.Agendapunt.count}, Agendapuntitle: ${results.AgendapuntTitle.count}, AgendapuntDescription: ${results.AgendapuntDescription.count}, Besluit: ${results.Besluit.count}, Stemming: ${results.Stemming.count}`
        );

        const reportUri = await insertGoverningBodyReport(
          governingBody,
          adminUnit,
          results,
          defaultedDay
        );
        governingBodyReportUriList.push(reportUri);
      }

      progress.update(
        `All reports processed for endpoint "${endpoint.url}" for admin unit "${adminUnit.label}"`
      );
    }

    return governingBodyReportUriList;
  }

  async function writeAdminUnitReports(
    adminUnits: AdminUnitRecord[],
    endpoints: EndpointConfig[],
    defaultedDay: DateOnly
  ) {
    for (const adminUnit of adminUnits) {
      const governingBodyReportUriList = await processAdminUnitAcrossEndpoints(
        adminUnit,
        endpoints,
        defaultedDay
      );

      const uuid = uuidv4();
      console.log("UUIDDDDDDDDD", uuid);
      await performInsert(
        "AdminUnitCountReport",
        writeAdminUnitCountReportQuery,
        {
          prefixes: PREFIXES,
          reportGraphUri: `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DMGEBRUIKER`,
          adminUnitUri: adminUnit.uri,
          prefLabel: `Count report for admin unit '${adminUnit.label}' on ${defaultedDay}`,
          reportUri: `${config.env.URI_PREFIX_RESOURCES}${uuid}`,
          uuid,
          createdAt: now(),
          day: defaultedDay,
          reportUris: governingBodyReportUriList,
        }
      );

      progress.update(`Admin unit report written for "${adminUnit.label}"`);
    }
  }
};

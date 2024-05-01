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

type OrganisationsAndGovBodies = {
  adminUnits: {
    uri: string;
    label: string;
    id: string;
    govBodies: {
      uri: string;
      label: string;
    }[];
  }[];
};

let orgResourcesCache: OrganisationsAndGovBodies | null = null;
let timer: NodeJS.Timeout | null = null;

async function getOrgResouces(): Promise<OrganisationsAndGovBodies> {
  const result: OrganisationsAndGovBodies = { adminUnits: [] };
  const getOrganisationsQuery = new TemplatedSelect<
    GetOrganisationsInput,
    GetOrganisationsOutput
  >(queryEngine, config.env.ADMIN_UNIT_ENDPOINT, getOrganisationsTemplate);
  const getGoveringBodiesOfAdminUnitQuery = new TemplatedSelect<
    GetGoveringBodiesInput,
    GetGoveringBodiesOutput
  >(
    queryEngine,
    config.env.ADMIN_UNIT_ENDPOINT,
    getGoverningBodiesOfAdminUnitTemplate
  );

  const orgs = await getOrganisationsQuery.objects({
    prefixes: PREFIXES,
    limit: config.env.LIMIT_NUMBER_ADMIN_UNITS, // 0 means infinite
  });
  await delay(config.env.SLEEP_BETWEEN_QUERIES_MS);

  for (const org of orgs) {
    const govBodies = await getGoveringBodiesOfAdminUnitQuery.objects({
      prefixes: PREFIXES,
      adminitrativeUnitUri: org.organisationUri, // uri
    });
    result.adminUnits.push({
      uri: org.organisationUri,
      label: org.label,
      id: org.id,
      govBodies: govBodies.map((record) => {
        return {
          uri: record.goveringBody,
          label: record.label,
        };
      }),
    });
    await delay(config.env.SLEEP_BETWEEN_QUERIES_MS); // Await in for loop is icky. But here we have no choice.
  }
  // Cache is successfully loded. Reset or set timer
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    orgResourcesCache = null;
  }, config.env.ORG_RESOURCES_TTL_S * 1000);
  return result;
}

export async function getOrgResoucesCached(): Promise<OrganisationsAndGovBodies> {
  if (orgResourcesCache) {
    console.info("Got org resources from cache.");
    return orgResourcesCache;
  }
  orgResourcesCache = await getOrgResouces();
  return orgResourcesCache;
}

function getQueryMachines(queryEngine: QueryEngine, endpoint: string) {
  const countSessionsQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countSessionsQueryTemplate);
  const countAgendaItemsQuery = new TemplatedSelect<
    CountSessionsQueryInput,
    CountSessionsQueryOutput
  >(queryEngine, endpoint, countAgendaItemsQueryTemplate);
  const countResolutionsQuery = new TemplatedSelect<
    CountResolutionsQueryInput,
    CountResolutionsQueryOutput
  >(queryEngine, endpoint, countResolutionsQueryTemplate);

  const countVoteQuery = new TemplatedSelect<
    CountVoteQueryInput,
    CountVoteQueryOutput
  >(queryEngine, endpoint, countVoteQueryTemplate);

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
    countSessionsQuery,
    countAgendaItemsQuery,
    countResolutionsQuery,
    countVoteQuery,
    writeCountReportQuery,
    writeAdminUnitCountReportQuery,
  };
}

export async function generateReports(day: DateOnly) {
  //For every org query counts for all resource types
  const orgResources = await getOrgResoucesCached();

  for (const endpoint of config.file) {
    // Prepare the death machines
    const {
      countSessionsQuery,
      countAgendaItemsQuery,
      countResolutionsQuery,
      countVoteQuery,
      writeCountReportQuery,
      writeAdminUnitCountReportQuery,
    } = getQueryMachines(queryEngine, endpoint.url);

    for (const adminUnit of orgResources.adminUnits) {
      const governingBodyReportUriList: string[] = [];
      // TODO: make a catalog of query machines for each resource type
      for (const goveringBody of adminUnit.govBodies) {
        const sessionsResult = await countSessionsQuery.result({
          prefixes: PREFIXES,
          governingBodyUri: goveringBody.uri,
          from: day.localStartOfDay,
          to: day.localEndOfDay,
          noFilterForDebug: config.env.NO_TIME_FILTER,
        });

        const agendaItemResult = await countAgendaItemsQuery.result({
          prefixes: PREFIXES,
          governingBodyUri: goveringBody.uri,
          from: day.localStartOfDay,
          to: day.localEndOfDay,
          noFilterForDebug: config.env.NO_TIME_FILTER,
        });

        const resolutionResult = await countResolutionsQuery.result({
          prefixes: PREFIXES,
          governingBodyUri: goveringBody.uri,
          from: day.localStartOfDay,
          to: day.localEndOfDay,
          noFilterForDebug: config.env.NO_TIME_FILTER,
        });

        const voteResult = await countVoteQuery.result({
          prefixes: PREFIXES,
          governingBodyUri: goveringBody.uri,
          from: day.localStartOfDay,
          to: day.localEndOfDay,
          noFilterForDebug: config.env.NO_TIME_FILTER,
        });

        const reportUri = `http://lblod.data.gift/vocabularies/datamonitoring/countReport/${uuidv4()}`;
        governingBodyReportUriList.push(reportUri);

        // Write govering body report
        await writeCountReportQuery.execute({
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
      await writeAdminUnitCountReportQuery.execute({
        prefixes: PREFIXES,
        reportGraphUri: config.env.REPORT_GRAPH_URI,
        adminUnitUri: adminUnit.uri,
        prefLabel: `Count report for admin unit '${adminUnit.label}' on ${day}`,
        reportUri: `http://lblod.data.gift/vocabularies/datamonitoring/countReport/${uuidv4()}`,
        createdAt: dayjs(),
        day,
        reportUris: governingBodyReportUriList,
      });
    }
  }

  // async function getOrganisations() {
}

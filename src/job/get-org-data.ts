import { QueryEngine } from "@comunica/query-sparql";
import { config } from "../configuration.js";
import { PREFIXES } from "../local-constants.js";
import {
  GetGoveringBodiesInput,
  GetGoveringBodiesOutput,
  GetOrganisationsInput,
  GetOrganisationsOutput,
  getGoverningBodiesOfAdminUnitTemplate,
  getOrganisationsTemplate,
} from "../queries/util-queries.js";
import { TemplatedSelect } from "../queries/templated-query.js";
import { delay } from "../util/util.js";
import { logger } from "../logger.js";

type OrganisationsAndGovBodies = {
  adminUnits: {
    uri: string;
    label: string;
    id: string;
    govBodies: {
      uri: string;
      classLabel: string;
    }[];
  }[];
};

let orgResourcesCache: OrganisationsAndGovBodies | null = null;
let timer: NodeJS.Timeout | null = null;

type GetOrganisationsCleanOutput = {
  organisationUri: string;
  label: string;
  id: string;
};

async function getOrgResouces(
  queryEngine: QueryEngine
): Promise<OrganisationsAndGovBodies> {
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

  const orgs = await getOrganisationsQuery.objects("organisationUri", {
    prefixes: PREFIXES,
    limit: config.env.LIMIT_NUMBER_ADMIN_UNITS, // 0 means infinite
    graphUri: config.env.ADMIN_UNIT_GRAPH_URI,
  });
  await delay(config.env.SLEEP_BETWEEN_QUERIES_MS);

  // Turns out some admin units are not OK. Some have two labels and/or two ID's.
  // Fix the dirty ones and put them in two bins. Later on we can decide what to do with the dirty ones.
  const { clean, dirty } = orgs.reduce<{
    clean: GetOrganisationsCleanOutput[];
    dirty: GetOrganisationsCleanOutput[];
  }>(
    (acc, curr) => {
      if (Array.isArray(curr.id) || Array.isArray(curr.label)) {
        acc.dirty.push({
          organisationUri: curr.organisationUri,
          id: Array.isArray(curr.id) ? curr.id.join(",") : curr.id,
          label: Array.isArray(curr.label) ? curr.label.join(",") : curr.label,
        });
      } else {
        acc.clean.push(curr as GetOrganisationsCleanOutput);
      }
      return acc;
    },
    {
      clean: [],
      dirty: [],
    }
  );

  if (dirty.length > 0)
    logger.warn(
      `Discovered ${dirty.length} organisations which either have two id's or two labels. They have been sanitised by joining the id's and/or labels but this points to a data quality issue. Please check the data source "${config.env.ADMIN_UNIT_ENDPOINT}"`
    );

  const cleanOrgs = [...clean, ...dirty];
  logger.debug(`Got ${cleanOrgs.length} organisations.`);

  for (const org of cleanOrgs) {
    const govBodies = await getGoveringBodiesOfAdminUnitQuery.objects(
      "goveringBodyUri",
      {
        prefixes: PREFIXES,
        adminitrativeUnitUri: org.organisationUri, // uri
        graphUri: config.env.ADMIN_UNIT_GRAPH_URI,
      }
    );
    logger.debug(
      `Got ${govBodies.length} governing bodies for org ${org.organisationUri}`
    );
    result.adminUnits.push({
      uri: org.organisationUri,
      label: org.label,
      id: org.id,
      govBodies: govBodies.map((record) => {
        return {
          uri: record.goveringBodyUri,
          classLabel: record.classLabel,
        };
      }),
    });
    // Awaiting and/or delaying in for loop is icky. But here we have no choice.
    // We are deliberately not looking for performance of this application or we risk overloading the database
    await delay(config.env.SLEEP_BETWEEN_QUERIES_MS);
  }
  // Cache is successfully loded. Reset or set timer
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    orgResourcesCache = null;
  }, config.env.ORG_RESOURCES_TTL_S * 1000);
  return result;
}

/**
 * This is the main function of the module. It perform SPARQL queries to get a data structure containing all of the admin units and their associated governing bodies.
 * Because this can take a while a cache is used in order to prevent querying the admin unit endpoint constantly.
 * @param queryEngine
 * @returns The datastructure of type OrganisationsAndGovBodies
 */
export async function getOrgResoucesCached(
  queryEngine: QueryEngine
): Promise<OrganisationsAndGovBodies> {
  if (orgResourcesCache) {
    console.debug("Got org resources from cache.");
    return orgResourcesCache;
  }
  console.debug(
    `Need to get org resources from cache from "${config.env.ADMIN_UNIT_ENDPOINT}" in the graph "${config.env.ADMIN_UNIT_GRAPH_URI}"`
  );
  orgResourcesCache = await getOrgResouces(queryEngine);
  return orgResourcesCache;
}

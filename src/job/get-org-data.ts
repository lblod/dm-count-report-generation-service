import { QueryEngine } from "@comunica/query-sparql";
import { config } from "configuration.js";
import { PREFIXES } from "local-constants.js";
import {
  GetGoveringBodiesInput,
  GetGoveringBodiesOutput,
  GetOrganisationsInput,
  GetOrganisationsOutput,
  getGoverningBodiesOfAdminUnitTemplate,
  getOrganisationsTemplate,
} from "queries/queries.js";
import { TemplatedSelect, delay } from "queries/templated-query.js";

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

export async function getOrgResoucesCached(
  queryEngine: QueryEngine
): Promise<OrganisationsAndGovBodies> {
  if (orgResourcesCache) {
    console.info("Got org resources from cache.");
    return orgResourcesCache;
  }
  orgResourcesCache = await getOrgResouces(queryEngine);
  return orgResourcesCache;
}

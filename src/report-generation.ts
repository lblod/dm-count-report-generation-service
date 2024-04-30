
import { config } from 'configuration';
import { GetGoveringBodiesInput, GetGoveringBodiesOutput, GetOrganisationsOutput, GetOrganisationsInput, WriteReportInput, getGoverningBodiesOfAdminUnitTemplate, getOrganisationsTemplate, writeCountReportQueryTemplate, countSessionsQueryTemplate, CountSessionsQueryInput, CountSessionsQueryOutput, countAgendaItemsQueryTemplate } from './report-generation/queries';
import { queryEngine } from './report-generation/query-engine';
import { PREFIXES } from 'local-constants';
import { v4 as uuidv4 } from 'uuid';
import { DateOnly } from 'date';
import { TemplatedInsert, TemplatedSelect, delay } from 'report-generation/util';
import dayjs from 'dayjs';
import logger from 'logger';

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
}

let orgResourcesCache : OrganisationsAndGovBodies | null = null;
let timer: NodeJS.Timeout | null = null;

async function getOrgResouces(): Promise<OrganisationsAndGovBodies> {
  const result: OrganisationsAndGovBodies = {adminUnits: []};
  const getOrganisationsQuery = new TemplatedSelect<GetOrganisationsInput,GetOrganisationsOutput>(
    queryEngine,
    config.env.ADMIN_UNIT_ENDPOINT,
    getOrganisationsTemplate,
  );
  const getGoveringBodiesOfAdminUnitQuery = new TemplatedSelect<GetGoveringBodiesInput,GetGoveringBodiesOutput> (
    queryEngine,
    config.env.ADMIN_UNIT_ENDPOINT,
    getGoverningBodiesOfAdminUnitTemplate,
  )

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
      id:org.id,
      govBodies: govBodies.map((record)=>{
        return {
          uri: record.goveringBody,
          label: record.label,
        }
      })
    });
    await delay(config.env.SLEEP_BETWEEN_QUERIES_MS); // Await in for loop is icky. But here we have no choice.
  }
  // Cache is successfully loded. Reset or set timer
  if (timer) clearTimeout(timer);
  timer = setTimeout(()=>{
    orgResourcesCache = null;
  },config.env.ORG_RESOURCES_TTL_S*1000);
  return result;
}

export async function getOrgResoucesCached(): Promise<OrganisationsAndGovBodies> {
  if (orgResourcesCache) {
    console.info('Got org resources from cache.')
    return orgResourcesCache;
  }
  orgResourcesCache = await getOrgResouces();
  return orgResourcesCache;
}

export async function generateReports(day:DateOnly) {
  //For every org query counts for all resource types
  const orgResources = await getOrgResoucesCached();
  logger.info(JSON.stringify(orgResources,undefined,3));

  for (const endpoint of config.file) {
      // Prepare the machines
    const countSessionsQuery = new TemplatedSelect<
      CountSessionsQueryInput,
      CountSessionsQueryOutput
    >(
      queryEngine,
      endpoint.url,
      countSessionsQueryTemplate
    );
    const countAgendaItemsQuery = new TemplatedSelect<
      CountSessionsQueryInput,
      CountSessionsQueryOutput
    >(
      queryEngine,
      endpoint.url,
      countAgendaItemsQueryTemplate,
    );

    const writeCountReportQuery = new TemplatedInsert<WriteReportInput>(
      queryEngine,
      endpoint.url,
      writeCountReportQueryTemplate,
    );

    for (const adminUnit of orgResources.adminUnits) {
      const governingBodyReportUriList: string [] = [];
      // TODO: make a catalog of query machines for each resource type
      for (const goveringBody of adminUnit.govBodies) {
        const sessionsResult = await countSessionsQuery.result({
          prefixes: PREFIXES,
          governingBodyUri: goveringBody.uri,
          from: day.localStartOfDay,
          to:day.localEndOfDay,
        });

        const agendaItemResult = await countAgendaItemsQuery.result({
          prefixes: PREFIXES,
          governingBodyUri: goveringBody.uri,
          from: day.localStartOfDay,
          to:day.localEndOfDay,
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
          counts: [
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Zitting`,
              count: sessionsResult.count
            },
            {
              classUri: `http://data.vlaanderen.be/ns/besluit#Agendapunt`,
              count: agendaItemResult.count
            },
          ]
        });
      }
      // Write admin unit report
    }
  }

// async function getOrganisations() {


}

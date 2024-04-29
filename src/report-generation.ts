
import { config } from 'configuration';
import { CountInput, GetGoveringBodiesInput, GetGoveringBodiesOutput, GetOrganisationsOutput, GetOrganisationsInput, WriteReportInput, getCountForOrgQueryTemplate, getGoverningBodiesOfAdminUnitTemplate, getOrganisationsTemplate, writeCountReportQueryTemplate } from './report-generation/queries';
import { queryEngine } from './report-generation/query-engine';
import { PREFIXES } from 'local-constants';
import { v4 as uuidv4 } from 'uuid';
import { DateOnly } from 'date';
import { TemplatedInsert, TemplatedSelect, delay } from 'report-generation/util';

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

export async function generateReports() {
  //For every org query counts for all resource types
  const orgResources = await getOrgResoucesCached();
  console.log(JSON.stringify(orgResources,undefined,3));


  // for (const endpoint of config.file) {
  //   const query = new TemplatedQuery<CountInput,Record<string,number>>(
  //     queryEngine,
  //     endpoint.url,
  //     getCountForOrgQueryTemplate,
  //   );

  //   const objects = await query.getObjects({
  //     prefixes: PREFIXES,
  //     classes: endpoint.classes,
  //   });



  // // }
  // // Write reports
  // const writeReportQuery = new TemplatedInsert<WriteReportInput>(
  //   queryEngine,
  //   config.env.REPORT_ENDPOINT,
  //   writeCountReportQueryTemplate,
  // )
  // const input = {
  //   prefixes: PREFIXES,
  //   newUuid: uuidv4(),
  //   createdAt: new DateOnly("2024-04-26"),
  //   govBodyUri: "http://codifly.be/namespaces/test/testGovBody",
  //   reportGraphUri: config.env.REPORT_GRAPH_URI,
  //   counts: [
  //     {
  //       classUri: "http://data.vlaanderen.be/ns/besluit#Besluit",
  //       count: 100
  //     },
  //     {
  //       classUri: "http://data.vlaanderen.be/ns/besluit#Agendapunt",
  //       count: 200
  //     },
  //   ]
  // };
  // console.log(writeReportQuery.getQuery(input));
  // await writeReportQuery.insertData(input);
}

// async function getOrganisations() {


// }

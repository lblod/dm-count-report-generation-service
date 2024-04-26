
import { config } from 'configuration';
import { CountInput, WriteReportInput, getCountForOrgQueryTemplate, writeCountReportQueryTemplate } from './report-generation/queries';
import { queryEngine } from './report-generation/query-engine';
import { TemplatedQuery } from './report-generation/util';
import { PREFIXES } from 'local-constants';
import { v4 as uuidv4 } from 'uuid';
import { DateOnly } from 'date';

export async function generateReports() {
  // const orgs = await getOrganisationsQuery.getObjects({prefixes: PREFIXES});
  // For every org query counts for all resource types
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


  // }
  // Write reports
  const writeReportQuery = new TemplatedQuery<WriteReportInput,never>(
    queryEngine,
    config.env.REPORT_ENDPOINT,
    writeCountReportQueryTemplate,
  )
  const input = {
    prefixes: PREFIXES,
    newUuid: uuidv4(),
    createdAt: new DateOnly("2024-04-26"),
    govBodyUri: "http://codifly.be/namespaces/test/testGovBody",
    reportGraphUri: config.env.REPORT_GRAPH_URI,
    counts: [
      {
        classUri: "http://data.vlaanderen.be/ns/besluit#Besluit",
        count: 100
      },
      {
        classUri: "http://data.vlaanderen.be/ns/besluit#Agendapunt",
        count: 200
      },
    ]
  };
  await writeReportQuery.insertData(input);
}

// async function getOrganisations() {


// }

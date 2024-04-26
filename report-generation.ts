import config from './config';
import { getCountForOrgQueryTemplate, PREFIXES } from './report-generation/queries';
import { queryEngine } from './report-generation/query-engine';
import { EncapsulatedQuery } from './report-generation/util';

type CountInput = {
  prefixes: string;
  classes: readonly string[];
}

export async function generateReports() {
  // const orgs = await getOrganisationsQuery.getObjects({prefixes: PREFIXES});
  // For every org query counts for all resource types
  for (const endpoint of config.file) {
    const query = new EncapsulatedQuery<CountInput,Record<string,number>>(
      queryEngine,
      endpoint.url,
      getCountForOrgQueryTemplate,
    );
    console.log(query.getQuery({
      prefixes: PREFIXES,
      classes: endpoint.classes,
    }));
  }
}

// async function getOrganisations() {


// }

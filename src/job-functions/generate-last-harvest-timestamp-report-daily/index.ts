import { QueryEngine } from "@comunica/query-sparql";
import { v4 as uuidv4 } from "uuid";
import { config } from "../../configuration.js";
import { getOrgResoucesCached } from "../../job/get-org-data.js";
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
  GetLastModifiedInput,
  GetLastModifiedOutput,
  getLastModifiedTemplate,
  HarvestingTimeStampResult,
  InsertLastExecutedReportInput,
  insertLastExecutedReportTemplate,
} from "./queries.js";

function getQueries(queryEngine: QueryEngine, endpoint: string) {
  const getLastModifiedQuery = new TemplatedSelect<
    GetLastModifiedInput,
    GetLastModifiedOutput
  >(queryEngine, endpoint, getLastModifiedTemplate);
  return {
    getLastModifiedQuery,
  };
}

const STRIP_REGEX = /^[\s\n\t]+|[\s\n\t]+$/;

function stripAndLower(input: string): string {
  return input.toLowerCase().replace(STRIP_REGEX, "");
}

/**
 * Job function checking the last time the harvester harvested any linked data associated with the a specific admin unit
 * @param progress Default progress object passed to any job function
 * @param day The day of the year this job needs to take into account. The report only takes into account the published resources of a single day. Default value is yesterday.
 */
export const getHarvestingTimestampDaily: JobFunction = async (
  progress,
  day: DateOnly | undefined = undefined
) => {
  const defaultedDay = day ?? DateOnly.yesterday();
  progress.update(
    `Get harvest timestamp function invoked with day ${defaultedDay.toString()}`
  );
  progress.update(`Getting org resources`);
  const orgResources = await getOrgResoucesCached(queryEngine);
  let queries = 0;
  const queryCount = config.file.harvesterEndpoints.length * 1 + 1; // One query per harvester and one report writing query
  progress.update(
    `Got ${orgResources.adminUnits.length} admin units. Getting lastmodified data from harvesters.`
  );

  const allRecords: GetLastModifiedOutput[] = [];

  // Perform the query on all the harvesters.
  for (const harvester of config.file.harvesterEndpoints) {
    const { getLastModifiedQuery } = getQueries(queryEngine, harvester.url);
    const result = await duration(
      getLastModifiedQuery.records.bind(getLastModifiedQuery)
    )({
      prefixes: PREFIXES,
    });
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    allRecords.push(...result.result);
  }

  progress.update(
    `All ${config.file.harvesterEndpoints.length} harvesters queried for modified jobs. Got ${allRecords.length} records. Cross correlating 'titles' of the jobs with the labels of organisations.`
  );

  const notFound: string[] = [];

  const output: HarvestingTimeStampResult[] = [];
  // Not the most efficient. Comparing the title to the
  for (const org of orgResources.adminUnits) {
    const record = allRecords.find(
      (record) => stripAndLower(org.label) === stripAndLower(record.title)
    );
    if (!record) {
      notFound.push(org.uri);
      continue;
    }
    const uuid = uuidv4();
    output.push({
      resultUri: `${config.env.URI_PREFIX_RESOURCES}${uuid}`,
      uuid,
      organisationUri: org.uri,
      organisationLabel: org.label,
      lastExecutionTimestamp: record.lastModified,
    });
  }
  progress.update(
    `Found execution timestamps for ${
      output.length
    } organisations for a total of ${orgResources.adminUnits.length}(${(
      (100.0 * output.length) /
      orgResources.adminUnits.length
    ).toFixed(1)}%).`
  );
  if (notFound.length !== 0) {
    progress.update(
      `Organisations for which no record was found are:\n\t${notFound.join(
        "\n\t"
      )}`
    );
  }

  const insertLastExecutedReportTimeQuery =
    new TemplatedInsert<InsertLastExecutedReportInput>(
      queryEngine,
      config.env.REPORT_ENDPOINT,
      insertLastExecutedReportTemplate
    );
  for (const adminUnit of orgResources.adminUnits) {
    const uuid = uuidv4();
    const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
    const result = await duration(
      insertLastExecutedReportTimeQuery.execute.bind(
        insertLastExecutedReportTimeQuery
      )
    )({
      prefixes: PREFIXES,
      day: defaultedDay,
      prefLabel: `Report of last harvesting execution times for ${
        adminUnit.label
      } on day ${defaultedDay.toString()}`,
      reportGraphUri: `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DM-AdminUnitAdministratorRole`,
      reportUri,
      createdAt: now(),
      times: output,
      uuid,
    });
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    progress.update(`All reports written for execution times.`);
  }
};

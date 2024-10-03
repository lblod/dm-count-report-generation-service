import { QueryEngine } from "@comunica/query-sparql";
import { v4 as uuidv4 } from "uuid";
import { config } from "../../configuration.js";
import { getOrgResoucesCached } from "../../job/get-org-data.js";
import { JobFunction, JobProgress } from "../../job/job.js";
import { PREFIXES } from "../../local-constants.js";
import { queryEngine } from "../../queries/query-engine.js";
import {
  TemplatedInsert,
  TemplatedSelect,
} from "../../queries/templated-query.js";
import { DateOnly, now } from "../../util/date-time.js";
import { duration } from "../../util/util.js";
import {
  GetMaturityLevelInput,
  GetMaturityLevelOutput,
  getMaturityLevelTemplate,
  InsertMaturityLevelInput,
  insertMaturityLevelTemplate,
} from "./queries.js";

function getQueries(queryEngine: QueryEngine, endpoint: string) {
  const getMaturityLevelQuery = new TemplatedSelect<
    GetMaturityLevelInput,
    GetMaturityLevelOutput
  >(queryEngine, endpoint, getMaturityLevelTemplate);
  return {
    getMaturityLevelQuery,
  };
}

export const getMaturityLevelDaily: JobFunction = async (
  progress,
  day: DateOnly | undefined = undefined
) => {
  const allRecords = await getMaturityLevel(progress);
  await insertMaturityLevel(allRecords, progress, day);
};

const getMaturityLevel = async (progress: JobProgress) => {
  const orgResources = await getOrgResoucesCached(queryEngine);
  const allRecords: GetMaturityLevelOutput[] = [];
  const queryCount = config.file.harvesterEndpoints.length * 1 + 1;
  let queries = 0;
  progress.update(`Get maturity levels`);
  progress.update(
    `Got ${orgResources.adminUnits.length} admin units. Getting maturity level data from harvesters.`
  );
  for (const harvester of config.file.harvesterEndpoints) {
    for (const adminUnit of orgResources.adminUnits) {
      for (const govBody of adminUnit.govBodies) {
        const { getMaturityLevelQuery } = getQueries(
          queryEngine,
          harvester.url
        );
        const result = await duration(
          getMaturityLevelQuery.records.bind(getMaturityLevelQuery)
        )({
          prefixes: PREFIXES,
          governingBodyUri: govBody.uri,
        });
        progress.progress(++queries, queryCount, result.durationMilliseconds);
        allRecords.push(...result.result);
      }
    }
  }
  progress.update(
    `All ${config.file.harvesterEndpoints.length} harvesters queried for maturity levels. Got ${allRecords.length} records.`
  );

  return allRecords;
};

const insertMaturityLevel = async (
  data: GetMaturityLevelOutput[],
  progress: JobProgress,
  day?: DateOnly | undefined
) => {
  const orgResources = await getOrgResoucesCached(queryEngine);
  const defaultedDay = day ?? DateOnly.yesterday();
  const insertMaturityLevelQuery =
    new TemplatedInsert<InsertMaturityLevelInput>(
      queryEngine,
      config.env.REPORT_ENDPOINT,
      insertMaturityLevelTemplate
    );
  const queryCount = config.file.harvesterEndpoints.length * 1 + 1;
  let queries = 0;
  progress.update(`Insert maturity levels`);
  for (const adminUnit of orgResources.adminUnits) {
    const record = data.find((record) =>
      adminUnit.govBodies.some(
        (govBody) => govBody.uri === record.governingBodyUri
      )
    );

    if (record) {
      const notuleUri = record.notuleUri;
      const uuid = uuidv4();
      const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
      const result = await duration(
        insertMaturityLevelQuery.execute.bind(insertMaturityLevelQuery)
      )({
        prefixes: PREFIXES,
        day: defaultedDay,
        prefLabel: `Report of maturity level for ${
          adminUnit.label
        } on day ${defaultedDay.toString()}`,
        reportGraphUri: `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DM-AdminUnitAdministratorRole`,
        reportUri,
        createdAt: now(),
        notuleUri,
        uuid,
      });
      progress.progress(++queries, queryCount, result.durationMilliseconds);
    }
  }
  progress.update(`All maturity levels written.`);
};

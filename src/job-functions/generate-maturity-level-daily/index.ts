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
  try {
    await getMaturityLevel(progress, day);
  } catch (error) {
    console.error("Failed to process maturity levels:", error);
    progress.update("Error encountered during maturity levels processing.");
    throw error;
  }
};

const getMaturityLevel = async (progress: JobProgress, day?: DateOnly) => {
  const orgResources = await getOrgResoucesCached(queryEngine);
  const queryCount = config.file.harvesterEndpoints.length * orgResources.adminUnits.length;
  let queries = 0;

  progress.update(`Get maturity levels`);
  progress.update(
    `Got ${orgResources.adminUnits.length} admin units. Getting maturity level data from harvesters.`
  );

  for (const harvester of config.file.harvesterEndpoints) {
    const harvesterRecords: GetMaturityLevelOutput[] = [];
    const { getMaturityLevelQuery } = getQueries(queryEngine, harvester.url);
    for (const adminUnit of orgResources.adminUnits) {
      queries += 1;
      try {
        const results = await Promise.all(
          adminUnit.govBodies.map(async (govBody) => {
            try {
              const result = await duration(getMaturityLevelQuery.records.bind(getMaturityLevelQuery))({
                prefixes: PREFIXES,
                governingBodyUri: govBody.uri,
              });
              progress.progress(++queries, queryCount, result.durationMilliseconds);
              progress.update(`Got ${result.result.length} maturity level data for ${adminUnit.label} from ${govBody.classLabel}`);
              return {...result.result, adminUnitId: adminUnit.id};
            } catch (error) {
              console.error(`Error fetching maturity level for ${govBody.uri}:`, error);
              return [];
            }
          })
        );

        const flattenedResults = results.flat();
        harvesterRecords.push(...flattenedResults);
      } catch (error) {
        console.error(`Error processing admin unit ${adminUnit.label}:`, error);
      }
    }

    await insertMaturityLevel(harvesterRecords, progress, day);
    progress.update(
      `Harvester ${harvester.url} processed. ${harvesterRecords.length} records inserted.`
    );
  }

  progress.update(
    `All ${config.file.harvesterEndpoints.length} harvesters queried for maturity levels.`
  );
};

const insertMaturityLevel = async (
  data: GetMaturityLevelOutput[],
  progress: JobProgress,
  day?: DateOnly | undefined
) => {
  const defaultedDay = day ?? DateOnly.yesterday();
  const insertMaturityLevelQuery =
    new TemplatedInsert<InsertMaturityLevelInput>(
      queryEngine,
      config.env.REPORT_ENDPOINT,
      insertMaturityLevelTemplate
    );
  let queries = 0;
  progress.update(`Insert maturity levels`);
  for (const record of data) {
    try {
      const uuid = uuidv4();
      const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
      const result = await duration(
        insertMaturityLevelQuery.execute.bind(insertMaturityLevelQuery)
      )({
        prefixes: PREFIXES,
        day: defaultedDay,
        prefLabel: `Report of maturity level for day ${defaultedDay.toString()}`,
        reportGraphUri:  `${config.env.REPORT_GRAPH_URI}${record.adminUnitId}/DMGEBRUIKER`,

        reportUri,
        createdAt: now(),
        notuleUri: record.notuleUri,
        uuid,
      });
      progress.progress(++queries, data.length, result.durationMilliseconds);
    } catch (error) {
      console.error(`Error inserting maturity level record:`, error);
    }
  }
};

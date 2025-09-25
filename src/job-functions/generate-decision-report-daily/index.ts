import { QueryEngine } from "@comunica/query-sparql";
import { v4 as uuidv4 } from "uuid";
import { config } from "../../configuration.js";
import { AdminUnitRecord, getOrgResoucesCached, GoverningBodyRecord } from "../../job/get-org-data.js";
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
  GetDecisionInput,
  GetDecisionOutput,
  getDecisionTemplate,
  InsertDecisionInput,
  insertDecisionTemplate,
} from "./queries.js";
import { deleteIfRecordsTodayExist } from "../../queries/helpers.js";

function getQueries(queryEngine: QueryEngine, endpoint: string) {
  const getDecisionQuery = new TemplatedSelect<
    GetDecisionInput,
    GetDecisionOutput
  >(queryEngine, endpoint, getDecisionTemplate);
  return {
    getDecisionQuery,
  };
}

export const getDecisionDaily: JobFunction = async (
  progress,
  day: DateOnly | undefined = undefined
) => {
  try {
    await getDecision(progress, day);
  } catch (error) {
    console.error("Failed to process decisions:", error);
    progress.update("Error encountered during decisions processing.");
    throw error;
  }
};

const getDecision = async (progress: JobProgress, day?: DateOnly) => {
  const orgResources = await getOrgResoucesCached(queryEngine);
  const queryCount = config.file.harvesterEndpoints.length * orgResources.adminUnits.length;
  let queries = 0;

  progress.update(`Get decisions`);
  progress.update(
    `Got ${orgResources.adminUnits.length} admin units. Getting decisions level data from harvesters.`
  );

  for (const harvester of config.file.harvesterEndpoints) {
    const { getDecisionQuery } = getQueries(queryEngine, harvester.url);
    for (const adminUnit of orgResources.adminUnits) {
      queries += 1;
      try {
        const grouped = await groupByClassLabel(adminUnit.govBodies);
        const results = await Promise.all(
          Object.entries(grouped).map(async ([classLabel, uris]) => {
            try {
              const result = await duration(getDecisionQuery.records.bind(getDecisionQuery))({
                prefixes: PREFIXES,
                governingBodyUris: uris,
              });

              progress.progress(++queries, queryCount, result.durationMilliseconds);
              progress.update(
                `Got ${result.result.length} decision data for ${adminUnit.label} from ${classLabel}`
              );

              return result.result.map((item) => ({
                count: item.count ?? 0,
                adminUnit: adminUnit,
                classLabel
              }));
            } catch (error) {
              console.error(`Error fetching decision for ${classLabel}:`, error);
              return [];
            }
          })
        );

        const flattenedResults = results.flat();
        if (flattenedResults.length > 0) {
          await insertDecision(adminUnit, flattenedResults, progress, day);
          progress.update(
            `Harvester ${harvester.url} processed. ${flattenedResults.length} records inserted.`
          );

        }
      } catch (error) {
        console.error(`Error processing admin unit ${adminUnit.label}:`, error);
      }
    }



  }

  progress.update(
    `All ${config.file.harvesterEndpoints.length} harvesters queried for decisions.`
  );
};

const insertDecision = async (
  adminUnit: AdminUnitRecord,
  data: GetDecisionOutput[],
  progress: JobProgress,
  day?: DateOnly | undefined
) => {
  const graphUri = `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DMGEBRUIKER`;
  const defaultedDay = day ?? DateOnly.yesterday();
  await deleteIfRecordsTodayExist(progress, graphUri, 'DecisionReport');
  const insertDecisionQuery =
    new TemplatedInsert<InsertDecisionInput>(
      queryEngine,
      config.env.REPORT_ENDPOINT,
      insertDecisionTemplate
    );
  let queries = 0;
  progress.update(`Insert decisions`);
  for (const record of data) {
    try {
      if (record.count > 0) {
        const uuid = uuidv4();
        const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
        const result = await duration(
          insertDecisionQuery.execute.bind(insertDecisionQuery)
        )({
          prefixes: PREFIXES,
          day: defaultedDay,
          prefLabel: `Report of decision for day ${defaultedDay.toString()}`,
          reportGraphUri: graphUri,
          reportUri,
          adminUnitUri: record.adminUnit.uri,
          createdAt: now(),
          classLabel: record.classLabel,
          uuid,
          count: record.count,
        });
        progress.progress(++queries, data.length, result.durationMilliseconds);
      }
    } catch (error) {
      console.error(`Error inserting decision record:`, error);
    }
  }
};



async function groupByClassLabel(govBodies: GoverningBodyRecord[]) {
  const result: Record<string, string[]> = {};

  await Promise.all(
    govBodies.map(async (govBody) => {
      const { uri, classLabel } = govBody;

      if (!result[classLabel]) {
        result[classLabel] = [];
      }
      result[classLabel].push(uri);
    })
  );

  return result;
}

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
  GetSessionTimestampInput,
  GetSessionTimestampOutput,
  getSessionTimestampTemplate,
  InsertSessionTimestampInput,
  insertSessionTimestampTemplate,
} from "./queries.js";

function getQueries(queryEngine: QueryEngine, endpoint: string) {
  const getSessionTimestampQuery = new TemplatedSelect<
    GetSessionTimestampInput,
    GetSessionTimestampOutput
  >(queryEngine, endpoint, getSessionTimestampTemplate);
  return {
    getSessionTimestampQuery,
  };
}

export const getSessionTimestampDaily: JobFunction = async (
  progress,
  day: DateOnly | undefined = undefined
) => {
  const allRecords = await getSessionTimestamp(progress);
  await insertSessionTimestamp(allRecords, progress, day);
};

const getSessionTimestamp = async (progress: JobProgress) => {
  const orgResources = await getOrgResoucesCached(queryEngine);
  const allRecords: GetSessionTimestampOutput[] = [];
  const queryCount = config.file.harvesterEndpoints.length * 1 + 1;
  let queries = 0;
  progress.update(`Get session timestamps`);
  progress.update(
    `Got ${orgResources.adminUnits.length} admin units. Getting session timestamps data from harvesters.`
  );
  for (const harvester of config.file.harvesterEndpoints) {
    for (const adminUnit of orgResources.adminUnits) {
      for (const govBody of adminUnit.govBodies) {
        const { getSessionTimestampQuery } = getQueries(
          queryEngine,
          harvester.url
        );
        const result = await duration(
          getSessionTimestampQuery.records.bind(getSessionTimestampQuery)
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
    `All ${config.file.harvesterEndpoints.length} harvesters queried for session timestamps. Got ${allRecords.length} records.`
  );

  return allRecords;
};

const insertSessionTimestamp = async (
  data: GetSessionTimestampOutput[],
  progress: JobProgress,
  day?: DateOnly | undefined
) => {
  const orgResources = await getOrgResoucesCached(queryEngine);
  const defaultedDay = day ?? DateOnly.yesterday();
  const insertSessionTimestampQuery =
    new TemplatedInsert<InsertSessionTimestampInput>(
      queryEngine,
      config.env.REPORT_ENDPOINT,
      insertSessionTimestampTemplate
    );
  const queryCount = config.file.harvesterEndpoints.length * 1 + 1;
  let queries = 0;
  progress.update(`Insert session timestamps`);
  for (const adminUnit of orgResources.adminUnits) {
    const record = data.find((record) =>
      adminUnit.govBodies.some(
        (govBody) => govBody.uri === record.governingBodyUri
      )
    );

    if (record) {
      const firstSession = record.firstSession;
      const lastSession = record.lastSession;
      const uuid = uuidv4();
      const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
      const result = await duration(
        insertSessionTimestampQuery.execute.bind(insertSessionTimestampQuery)
      )({
        prefixes: PREFIXES,
        day: defaultedDay,
        prefLabel: `Report of session timestamps for ${
          adminUnit.label
        } on day ${defaultedDay.toString()}`,
        reportGraphUri: `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DMGEBRUIKER`,
        reportUri,
        createdAt: now(),
        firstSession,
        lastSession,
        uuid,
      });
      progress.progress(++queries, queryCount, result.durationMilliseconds);
    }
  }
  progress.update(`All session timestamps written.`);
};

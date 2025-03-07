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
  SessionTimestampRecord,
} from "./queries.js";
import dayjs from "dayjs";

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
  const records = await getSessionTimestamp(progress);
  return await insertSessionTimestamp(records, progress, day);
};

const getSessionTimestamp = async (progress: JobProgress) => {
  const orgResources = await getOrgResoucesCached(queryEngine);
  const totalQueries = config.file.harvesterEndpoints.length * orgResources.adminUnits.length;
  let completedQueries = 0;

  progress.update(`Get session timestamps`);
  progress.update(
    `Got ${orgResources.adminUnits.length} admin units. Getting session timestamps data from harvesters.`
  );

  const adminUnitSessions: SessionTimestampRecord[] = [];

  for (const harvester of config.file.harvesterEndpoints) {
    const { getSessionTimestampQuery } = getQueries(queryEngine, harvester.url);

    for (const adminUnit of orgResources.adminUnits) {
      const sessionTimestamps = await Promise.all(
        adminUnit.govBodies.map(async (govBody) => {
          const result = await duration(getSessionTimestampQuery.records.bind(getSessionTimestampQuery))({
            prefixes: PREFIXES,
            governingBodyUri: govBody.uri,
          });

          progress.progress(++completedQueries, totalQueries, result.durationMilliseconds);
          return result.result;
        })
      );

      const allTimestamps = sessionTimestamps.flat();

      if (allTimestamps.length > 0) {
        const firstSession = dayjs(
          Math.min(...allTimestamps.map(ts => ts.firstSession.toDate().getTime()))
        );
        const lastSession = dayjs(
          Math.max(...allTimestamps.map(ts => ts.lastSession.toDate().getTime()))
        );

        adminUnitSessions.push({ adminUnit, firstSession, lastSession });
      }
    }
  }

  progress.update(
    `All ${config.file.harvesterEndpoints.length} harvesters queried for session timestamps.`
  );

  return adminUnitSessions;
};


const insertSessionTimestamp = async (
  data: SessionTimestampRecord[],
  progress: JobProgress,
  day?: DateOnly
) => {
  const defaultedDay = day ?? DateOnly.yesterday();
  const insertSessionTimestampQuery = new TemplatedInsert<InsertSessionTimestampInput>(
    queryEngine,
    config.env.REPORT_ENDPOINT,
    insertSessionTimestampTemplate
  );
  const queryCount = data.length;
  let queries = 0;

  progress.update('Insert session timestamps');

  const insertPromises = data.map(async (record) => {
    if (!record) return;

    const uuid = uuidv4();
    const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;

    const result = await duration(
      insertSessionTimestampQuery.execute.bind(insertSessionTimestampQuery)
    )({
      prefixes: PREFIXES,
      day: defaultedDay,
      prefLabel: `Report of session timestamps for ${record.adminUnit.label} on day ${defaultedDay.toString()}`,
      reportGraphUri: `${config.env.REPORT_GRAPH_URI}${record.adminUnit.id}/DMGEBRUIKER`,
      reportUri,
      createdAt: now(),
      firstSession: record.firstSession,
      lastSession: record.lastSession,
      uuid,
    });

    progress.progress(++queries, queryCount, result.durationMilliseconds);
  });

  await Promise.all(insertPromises);
  progress.update('All session timestamps written.');
};

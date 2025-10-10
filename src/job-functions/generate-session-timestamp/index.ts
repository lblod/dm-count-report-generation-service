import { v4 as uuidv4 } from 'uuid';
import { config } from '../../configuration.js';
import { getHarvesterAdminUnits } from '../../helpers/merge-admin-units.js';
import { JobFunction, JobProgress } from '../../job/job.js';
import { PREFIXES } from '../../local-constants.js';
import { queryEngine } from '../../queries/query-engine.js';
import { TemplatedInsert, TemplatedSelect } from '../../queries/templated-query.js';
import { DateOnly, now } from '../../util/date-time.js';
import { duration } from '../../util/util.js';
import {
  GetSessionTimestampInput,
  GetSessionTimestampOutput,
  getSessionTimestampTemplate,
  InsertSessionTimestampInput,
  insertSessionTimestampTemplate,
  SessionTimestampRecord,
} from './queries.js';
import dayjs from 'dayjs';
import { GoverningBodyRecord } from '../../job/get-org-data.js';

function getSessionTimestampQuery(endpoint: string) {
  return new TemplatedSelect<GetSessionTimestampInput, GetSessionTimestampOutput>(
    queryEngine,
    endpoint,
    getSessionTimestampTemplate
  );
}

export const getSessionTimestampDaily: JobFunction = async (progress, day?: DateOnly) => {
  try {
    const { harvesterAdminUnitMap } = await getHarvesterAdminUnits(queryEngine);
    const records = await fetchSessionTimestamps(progress, harvesterAdminUnitMap);
    return await insertSessionTimestamps(records, progress, day);
  } catch (error) {
    console.error('Failed to process session timestamps:', error);
    progress.update('Error encountered during session timestamp processing.');
    throw error;
  }
};

async function fetchSessionTimestamps(
  progress: JobProgress,
  harvesterAdminUnitMap: Record<string, any[]>
) {
  progress.update('Fetching session timestamps from harvesters...');
  const adminUnitSessions: SessionTimestampRecord[] = [];
  let totalQueries = 0;
  let completedQueries = 0;

  // Count total queries for progress tracking
  totalQueries = Object.values(harvesterAdminUnitMap).reduce((sum, units) => sum + units.length, 0);

  for (const [harvesterUrl, adminUnits] of Object.entries(harvesterAdminUnitMap)) {
    const query = getSessionTimestampQuery(harvesterUrl);

    for (const adminUnit of adminUnits) {
      try {
        const bestuursorganenUris = adminUnit.govBodies.map((gb: GoverningBodyRecord) => gb.uri);
        if (!bestuursorganenUris.length) continue;

        const result = await duration(query.records.bind(query))({
          prefixes: PREFIXES,
          governingBodies: bestuursorganenUris,
        });

        const sessionData = result.result?.[0];
        if (sessionData) {
          const firstSession = dayjs(sessionData?.firstSession?.toDate());
          const lastSession = dayjs(sessionData?.lastSession?.toDate());

          if (firstSession || lastSession) {
            adminUnitSessions.push({ adminUnit, firstSession, lastSession });
          }
        }

        completedQueries++;
        progress.progress(completedQueries, totalQueries, result.durationMilliseconds);
        progress.update(`Processed admin unit ${adminUnit.label} from ${harvesterUrl}`);
      } catch (error) {
        console.error(`Failed for admin unit ${adminUnit.label} at ${harvesterUrl}:`, error);
        completedQueries++;
        progress.progress(completedQueries, totalQueries);
      }
    }
  }

  progress.update('Finished fetching session timestamps.');
  return adminUnitSessions;
}

async function insertSessionTimestamps(
  data: SessionTimestampRecord[],
  progress: JobProgress,
  day?: DateOnly
) {
  if (!data.length) {
    progress.update('No session timestamps to insert.');
    return;
  }

  const defaultedDay = day ?? DateOnly.today();
  const insertQuery = new TemplatedInsert<InsertSessionTimestampInput>(
    queryEngine,
    config.env.REPORT_ENDPOINT,
    insertSessionTimestampTemplate
  );

  let queries = 0;
  await Promise.all(
    data.map(async (record) => {
      try {
        const uuid = uuidv4();
        const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;

        const result = await duration(insertQuery.execute.bind(insertQuery))({
          prefixes: PREFIXES,
          day: defaultedDay,
          prefLabel: `Report of session timestamps for ${record.adminUnit.label} on ${defaultedDay.toString()}`,
          reportGraphUri: `${config.env.REPORT_GRAPH_URI}${record.adminUnit.id}/DMGEBRUIKER`,
          reportUri,
          createdAt: now(),
          firstSession: record.firstSession,
          lastSession: record.lastSession,
          uuid,
        });

        queries++;
        progress.progress(queries, data.length, result.durationMilliseconds);
      } catch (error) {
        console.error(`Failed to insert session timestamp for ${record.adminUnit.label}:`, error);
      }
    })
  );

  progress.update('All session timestamps inserted.');
}

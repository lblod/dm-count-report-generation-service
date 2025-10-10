import { QueryEngine } from '@comunica/query-sparql';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../configuration.js';
import { GoverningBodyRecord } from '../../job/get-org-data.js';
import { JobFunction, JobProgress } from '../../job/job.js';
import { PREFIXES } from '../../local-constants.js';
import { queryEngine } from '../../queries/query-engine.js';
import { TemplatedInsert, TemplatedSelect } from '../../queries/templated-query.js';
import { DateOnly, now } from '../../util/date-time.js';
import { duration } from '../../util/util.js';
import {
  GetMaturityLevelInput,
  GetMaturityLevelOutput,
  getMaturityLevelTemplate,
  InsertMaturityLevelInput,
  insertMaturityLevelTemplate,
} from './queries.js';
import { deleteIfRecordsTodayExist } from '../../queries/helpers.js';
import { getHarvesterAdminUnits } from '../../helpers/merge-admin-units.js';

function getQueries(queryEngine: QueryEngine, endpoint: string) {
  return {
    getMaturityLevelQuery: new TemplatedSelect<GetMaturityLevelInput, GetMaturityLevelOutput>(
      queryEngine,
      endpoint,
      getMaturityLevelTemplate
    ),
  };
}

export const getMaturityLevelDaily: JobFunction = async (progress, day?: DateOnly) => {
  try {
    await processMaturityLevels(progress, day);
  } catch (error) {
    console.error('❌ Failed to process maturity levels:', error);
    progress.update('❌ Error encountered during maturity levels processing.');
    throw error;
  }
};

const processMaturityLevels = async (progress: JobProgress, day?: DateOnly) => {
  const defaultedDay = day ?? DateOnly.today();
  const cachedData = await getHarvesterAdminUnits(queryEngine);
  const harvesterAdminUnitMap = cachedData.harvesterAdminUnitMap;
  const totalAdminUnits = cachedData.countAdminUnits;

  progress.update(
    `📡 Got ${totalAdminUnits} admin units. Fetching maturity levels from harvesters...`
  );

  let totalQueries = 0;
  for (const units of Object.values(harvesterAdminUnitMap)) totalQueries += units.length;

  let completedQueries = 0;

  for (const [harvesterUrl, adminUnits] of Object.entries(harvesterAdminUnitMap)) {
    const { getMaturityLevelQuery } = getQueries(queryEngine, harvesterUrl);
    const harvesterResults: GetMaturityLevelOutput[] = [];

    progress.update(`⚙️ Processing harvester: ${harvesterUrl} (${adminUnits.length} admin units)`);

    // Parallelize admin unit SPARQL queries
    await Promise.all(
      adminUnits.map(async (adminUnit) => {
        try {
          const bestuursorganenUris = adminUnit.govBodies.map((gb: GoverningBodyRecord) => gb.uri);

          if (bestuursorganenUris.length === 0) {
            progress.update(`❌ Skipping ${adminUnit.label}, no governing bodies found`);
            completedQueries++;
            return;
          }

          const { result: records, durationMilliseconds: queryDuration } = await duration(
            getMaturityLevelQuery.records.bind(getMaturityLevelQuery)
          )({
            prefixes: PREFIXES,
            governingBodies: bestuursorganenUris,
          });

          completedQueries++;
          progress.progress(completedQueries, totalQueries, queryDuration);

          if (records.length === 0) {
            progress.update(`❌ No maturity level data found for ${adminUnit.label}`);
            return;
          }

          harvesterResults.push(
            ...records.map((item) => ({
              ...item,
              adminUnitId: adminUnit.id,
              adminUnitLabel: adminUnit.label,
              classification: adminUnit.classification,
            }))
          );

          progress.update(`✅ Fetched ${records.length} maturity records for ${adminUnit.label}`);
        } catch (error) {
          completedQueries++;
          console.error(`❌ Error fetching maturity level for ${adminUnit.label}:`, error);
          progress.update(`❌ Error with ${adminUnit.label}, skipping...`);
        }
      })
    );

    // Insert results for this harvester
    if (harvesterResults.length > 0) {
      await insertMaturityLevel(harvesterResults, progress, defaultedDay);
    }

    progress.update(
      `✅ Harvester ${harvesterUrl} processed. ${harvesterResults.length}/${adminUnits.length} records inserted.`
    );
  }

  progress.update(
    `🏁 All ${Object.keys(harvesterAdminUnitMap).length} harvesters queried for maturity levels.`
  );
};

const insertMaturityLevel = async (
  data: GetMaturityLevelOutput[],
  progress: JobProgress,
  day: DateOnly
) => {
  const insertQuery = new TemplatedInsert<InsertMaturityLevelInput>(
    queryEngine,
    config.env.REPORT_ENDPOINT,
    insertMaturityLevelTemplate
  );

  // Group by adminUnit to avoid multiple deleteIfRecordsTodayExist calls
  const recordsByAdminUnit = data.reduce<Record<string, GetMaturityLevelOutput[]>>(
    (acc, record) => {
      if (!acc[record.adminUnitId]) acc[record.adminUnitId] = [];
      acc[record.adminUnitId].push(record);
      return acc;
    },
    {}
  );

  let queriesDone = 0;
  for (const [adminUnitId, records] of Object.entries(recordsByAdminUnit)) {
    const graphUri = `${config.env.REPORT_GRAPH_URI}${adminUnitId}/DMGEBRUIKER`;

    await deleteIfRecordsTodayExist(progress, graphUri, 'MaturityLevelReport');

    for (const record of records) {
      if (!record.wasDerivedFrom) continue;

      try {
        const uuid = uuidv4();
        const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;

        const { durationMilliseconds: insertDuration } = await duration(
          insertQuery.execute.bind(insertQuery)
        )({
          prefixes: PREFIXES,
          day,
          prefLabel: `Report of maturity level for day ${day.toString()}`,
          reportGraphUri: graphUri,
          reportUri,
          createdAt: now(),
          notuleUri: record.wasDerivedFrom,
          uuid,
        });

        queriesDone++;
        progress.progress(queriesDone, data.length, insertDuration);
        progress.update(`✅ Inserted maturity level for ${record.adminUnitLabel}`);
      } catch (error) {
        console.error(`❌ Error inserting maturity level for ${record.adminUnitLabel}:`, error);
      }
    }
  }
};

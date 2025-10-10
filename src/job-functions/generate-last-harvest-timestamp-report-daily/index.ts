import { QueryEngine } from '@comunica/query-sparql';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../configuration.js';
import { JobFunction, JobProgress } from '../../job/job.js';
import { PREFIXES } from '../../local-constants.js';
import { queryEngine } from '../../queries/query-engine.js';
import { TemplatedInsert, TemplatedSelect } from '../../queries/templated-query.js';
import { DateOnly, now } from '../../util/date-time.js';
import { duration } from '../../util/util.js';
import {
  GetLastModifiedInput,
  GetLastModifiedOutput,
  getLastModifiedTemplate,
  HarvestingTimeStampResult,
  InsertLastExecutedReportInput,
  insertLastExecutedReportTemplate,
} from './queries.js';
import { deleteIfRecordsTodayExist } from '../../queries/helpers.js';
import { getHarvesterAdminUnits } from '../../helpers/merge-admin-units.js';

const STRIP_REGEX = /^[\s\n\t]+|[\s\n\t]+$/;
const stripAndLower = (input: string): string => input.toLowerCase().replace(STRIP_REGEX, '');

const getQueries = (engine: QueryEngine, endpoint: string) => ({
  getLastModifiedQuery: new TemplatedSelect<GetLastModifiedInput, GetLastModifiedOutput>(
    engine,
    endpoint,
    getLastModifiedTemplate
  ),
});

export const getHarvestingTimestampDaily: JobFunction = async (
  progress,
  day: DateOnly | undefined = undefined
) => {
  try {
    await getHarvestTimestamp(progress, day);
  } catch (error) {
    console.error('❌ Failed to process harvest timestamps:', error);
    progress.update('Error encountered during harvest timestamp processing.');
    throw error;
  }
};

const getHarvestTimestamp = async (progress: JobProgress, day?: DateOnly) => {
  const defaultedDay = day ?? DateOnly.today();
  const { countAdminUnits, harvesterAdminUnitMap } = await getHarvesterAdminUnits(queryEngine);

  progress.update(
    `📡 Got ${countAdminUnits} admin units. Fetching harvest timestamps from harvesters...`
  );

  const failedHarvesters: string[] = [];

  for (const [harvesterUrl, adminUnits] of Object.entries(harvesterAdminUnitMap)) {
    const { getLastModifiedQuery } = getQueries(queryEngine, harvesterUrl);

    let records: GetLastModifiedOutput[] = [];
    try {
      const res = await duration(getLastModifiedQuery.records.bind(getLastModifiedQuery))({
        prefixes: PREFIXES,
      });
      records = res.result;
      progress.update(
        `✅ Queried ${harvesterUrl}: ${records.length} records retrieved in ${res.durationMilliseconds}ms`
      );
    } catch (error) {
      console.error(`❌ Failed to query ${harvesterUrl}:`, error);
      failedHarvesters.push(harvesterUrl);
      continue;
    }

    // Build a lookup map for faster matching
    const recordMap = new Map<string, GetLastModifiedOutput>();
    for (const r of records) {
      recordMap.set(stripAndLower(r.title), r);
    }

    const insertData: HarvestingTimeStampResult[] = [];
    const notFound: string[] = [];

    for (const adminUnit of adminUnits) {
      const key = stripAndLower(adminUnit.label.split(',')[0]);
      const matched = recordMap.get(key);
      if (!matched) {
        notFound.push(adminUnit.label);
        continue;
      }
      const uuid = uuidv4();
      insertData.push({
        resultUri: `${config.env.URI_PREFIX_RESOURCES}${uuid}`,
        uuid,
        organisationUri: adminUnit.uri,
        organisationId: adminUnit.id,
        organisationLabel: adminUnit.label,
        lastExecutionTimestamp: matched.lastModified,
      });
    }

    await insertHarvestTimestamp(insertData, progress, defaultedDay);

    const foundPct = ((insertData.length / adminUnits.length) * 100).toFixed(1);
    progress.update(
      `✅ ${harvesterUrl}: Found ${insertData.length}/${adminUnits.length} (${foundPct}%) timestamps`
    );

    if (notFound.length) {
      progress.update(`❗ Unmatched orgs (${notFound.length}):\n\t${notFound.join('\n\t')}`);
    }
  }

  if (failedHarvesters.length) {
    progress.update(`⚠️ Failed harvesters:\n\t${failedHarvesters.join('\n\t')}`);
  }

  progress.update('✅ Harvest timestamp retrieval completed.');
};

const insertHarvestTimestamp = async (
  data: HarvestingTimeStampResult[],
  progress: JobProgress,
  day: DateOnly
) => {
  if (!data.length) return;

  const insertQuery = new TemplatedInsert<InsertLastExecutedReportInput>(
    queryEngine,
    config.env.REPORT_ENDPOINT,
    insertLastExecutedReportTemplate
  );

  await Promise.all(
    data.map(async (record, idx) => {
      try {
        const uuid = uuidv4();
        const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
        const graphUri = `${config.env.REPORT_GRAPH_URI}${record.organisationId}/DMGEBRUIKER`;

        // delete once per org
        const deleted = await deleteIfRecordsTodayExist(
          progress,
          graphUri,
          'LastHarvestingExecutionReport'
        );
        if (deleted.length) {
          progress.update(
            `🗑️ Deleted ${deleted.length} old reports for ${record.organisationLabel}`
          );
        }

        const res = await duration(insertQuery.execute.bind(insertQuery))({
          prefixes: PREFIXES,
          day,
          prefLabel: `Report of last harvesting execution times for ${record.organisationLabel} on ${day.toString()}`,
          reportGraphUri: graphUri,
          reportUri,
          createdAt: now(),
          times: [record],
          uuid,
        });

        progress.update(`✅ Inserted timestamp report for ${record.organisationLabel}`);
        progress.progress(idx + 1, data.length, res.durationMilliseconds);
      } catch (error) {
        console.error(`❌ Error inserting timestamp for ${record.organisationLabel}:`, error);
      }
    })
  );
};

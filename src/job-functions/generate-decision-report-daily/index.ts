import { QueryEngine } from '@comunica/query-sparql';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../../configuration.js';
import { AdminUnitRecord, GoverningBodyRecord } from '../../job/get-org-data.js';
import { JobFunction, JobProgress } from '../../job/job.js';
import { PREFIXES } from '../../local-constants.js';
import { queryEngine } from '../../queries/query-engine.js';
import { TemplatedInsert, TemplatedSelect } from '../../queries/templated-query.js';
import { DateOnly, now } from '../../util/date-time.js';
import { duration } from '../../util/util.js';
import {
  GetDecisionInput,
  GetDecisionOutput,
  getDecisionTemplate,
  InsertDecisionInput,
  insertDecisionTemplate,
} from './queries.js';
import { deleteIfRecordsTodayExist } from '../../queries/helpers.js';
import { getHarvesterAdminUnits } from '../../helpers/merge-admin-units.js';

const getDecisionQueries = (engine: QueryEngine, endpoint: string) => ({
  getDecisionQuery: new TemplatedSelect<GetDecisionInput, GetDecisionOutput>(
    engine,
    endpoint,
    getDecisionTemplate
  ),
});

export const getDecisionDaily: JobFunction = async (progress, day?: DateOnly) => {
  try {
    await processDecisions(progress, day);
  } catch (error) {
    console.error('❌ Failed to process decisions:', error);
    progress.update('Error encountered during decisions processing.');
    throw error;
  }
};

const processDecisions = async (progress: JobProgress, day?: DateOnly) => {
  const defaultedDay = day ?? DateOnly.today();

  progress.update('📡 Fetching harvester admin unit mapping...');
  const { countAdminUnits, harvesterAdminUnitMap } = await getHarvesterAdminUnits(queryEngine);

  progress.update(
    `✅ Got ${countAdminUnits} admin units. Fetching decision data from harvesters...`
  );

  for (const [harvesterUrl, adminUnits] of Object.entries(harvesterAdminUnitMap)) {
    const { getDecisionQuery } = getDecisionQueries(queryEngine, harvesterUrl);
    progress.update(
      `📡 Processing harvester: ${harvesterUrl} with ${adminUnits.length} admin units.`
    );

    for (const adminUnit of adminUnits) {
      let decisionResults: GetDecisionOutput[] = [];
      try {
        const groupedGovBodies = groupByClassLabel(adminUnit.govBodies);
        for (const [classLabel, govBodies] of Object.entries(groupedGovBodies)) {
          const res = await duration(getDecisionQuery.records.bind(getDecisionQuery))({
            prefixes: PREFIXES,
            governingBodyUris: govBodies,
            from: defaultedDay.localStartOfDay,
            to: defaultedDay.localEndOfDay,
          });

          decisionResults = decisionResults.concat(
            res.result
              .filter((item) => (item.count ?? 0) > 0)
              .map((item) => ({
                count: item.count ?? 0,
                adminUnit,
                classLabel,
              }))
          );

          progress.update(
            `✅ Found ${res.result?.[0].count} decisions for ${classLabel} for ${adminUnit.label} in ${res.durationMilliseconds}ms`
          );
        }
      } catch (error) {
        console.error(`❌ Error fetching decisions for ${adminUnit.label}:`, error);
        return;
      }
      progress.update(`✅ Fetched ${decisionResults.length} decisions for ${adminUnit.label}  `);
      if (decisionResults.length > 0) {
        await insertDecision(adminUnit, decisionResults, progress, defaultedDay);
      } else {
        progress.update(`❌ No decisions found for ${adminUnit.label} `);
      }
    }
  }

  progress.update('✅ All harvesters queried for decisions.');
};

// Optimized synchronous groupByClassLabel
function groupByClassLabel(govBodies: GoverningBodyRecord[]): Record<string, string[]> {
  return govBodies.reduce(
    (acc, { uri, classLabel }) => {
      (acc[classLabel] ||= []).push(uri);
      return acc;
    },
    {} as Record<string, string[]>
  );
}

const insertDecision = async (
  adminUnit: AdminUnitRecord,
  data: GetDecisionOutput[],
  progress: JobProgress,
  day: DateOnly
) => {
  const graphUri = `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DMGEBRUIKER`;
  await deleteIfRecordsTodayExist(progress, graphUri, 'DecisionReport');

  const insertQuery = new TemplatedInsert<InsertDecisionInput>(
    queryEngine,
    config.env.REPORT_ENDPOINT,
    insertDecisionTemplate
  );

  progress.update(`📤 Inserting ${data.length} decision records for ${adminUnit.label}...`);

  await Promise.all(
    data.map(async (record, idx) => {
      if (record.count <= 0) return;

      try {
        const uuid = uuidv4();
        const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
        const res = await duration(insertQuery.execute.bind(insertQuery))({
          prefixes: PREFIXES,
          day,
          prefLabel: `Report of decisions for ${adminUnit.label} on ${day.toString()}`,
          reportGraphUri: graphUri,
          reportUri,
          adminUnitUri: record.adminUnit.uri,
          createdAt: now(),
          classLabel: record.classLabel,
          uuid,
          count: record.count,
        });

        progress.update(`✅ Inserted decision for ${adminUnit.label} (${record.classLabel})`);
        progress.progress(idx + 1, data.length, res.durationMilliseconds);
      } catch (error) {
        console.error(
          `❌ Error inserting decision for ${adminUnit.label} (${record.classLabel}):`,
          error
        );
      }
    })
  );

  progress.update(`✅ All decision records for ${adminUnit.label} inserted.`);
};

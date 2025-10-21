import { v4 as uuidv4 } from 'uuid';
import { AdminUnitRecord, GoverningBodyRecord } from '../../job/get-org-data.js';
import { JobFunction } from '../../job/job.js';
import { PREFIXES } from '../../local-constants.js';
import { queryEngine } from '../../queries/query-engine.js';
import { TemplatedInsert, TemplatedSelect } from '../../queries/templated-query.js';
import { DateOnly, now } from '../../util/date-time.js';
import { duration } from '../../util/util.js';
import { config } from '../../configuration.js';

import { getQueriesForAnalysis, getQueriesForWriting } from './helpers.js';
import { AdminUnitClass, CountQueries, CountResult } from './types.js';
import { deleteIfRecordsTodayExist } from '../../queries/helpers.js';
import { getHarvesterAdminUnits } from '../../helpers/merge-admin-units.js';

export const generateReportsDaily: JobFunction = async (
  progress,
  day: DateOnly | undefined = undefined
) => {
  const defaultedDay = day ?? config.env.OVERRIDE_DAY ?? DateOnly.today();

  if (!config.env.INITIAL_SYNC) {
    progress.update(`📅 Report function invoked with day ${defaultedDay}`);
  }

  let queries = 0;
  const { countAdminUnits, harvesterAdminUnitMap } = await getHarvesterAdminUnits(queryEngine);
  const queryCount = countAdminUnits * 7;

  progress.progress(0, queryCount);
  progress.update(
    `📡 Got org resources. ${queryCount} queries to perform for ${countAdminUnits} admin units across ${config.file.endpoints.length} endpoints.`
  );

  const { writeCountReportQuery, writeAdminUnitCountReportQuery } = getQueriesForWriting(
    queryEngine,
    config.env.REPORT_ENDPOINT
  );

  const buildGraphUri = (adminUnitId: string) =>
    `${config.env.REPORT_GRAPH_URI}${adminUnitId}/DMGEBRUIKER`;

  // Helper for performing count queries
  async function performCount<I extends Record<string, any>, O extends Record<string, any>>(
    resource: string,
    query: TemplatedSelect<I, O>,
    input: I
  ): Promise<O> {
    const result = await duration(query.result.bind(query))(input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);

    if (result.result.count !== 0) {
      progress.update(
        `✅ Performed count query for "${resource}" in ${result.durationMilliseconds}ms. Returned ${result.result.count}.`
      );
    } else {
      progress.update(
        `⚠️ Count query for "${resource}" returned 0 results in ${result.durationMilliseconds}ms.`
      );
    }

    return result.result;
  }

  // Helper for performing insert queries
  async function performInsert<I extends Record<string, any>>(
    resource: string,
    query: TemplatedInsert<I>,
    input: I
  ): Promise<void> {
    const result = await duration(query.execute.bind(query))(input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    progress.update(`✅ Written '${resource}' in ${result.durationMilliseconds}ms`);
  }

  const insertGoverningBodyReport = async (
    adminUnit: AdminUnitRecord,
    results: Record<string, CountResult>,
    defaultedDay: DateOnly
  ): Promise<string> => {
    try {
      const reportUuid = uuidv4();
      const reportUri = `${config.env.URI_PREFIX_RESOURCES}${reportUuid}`;

      const counts = Object.entries(results)
        .filter(([_, result]) => result.count !== 0)
        .map(([label, result]) => {
          const countUuid = uuidv4();
          return {
            countUri: `${config.env.URI_PREFIX_RESOURCES}${countUuid}`,
            uuid: countUuid,
            classUri: `http://data.vlaanderen.be/ns/besluit#${label}`,
            count: result.count,
            prefLabel: `Count of '${label}'`,
          };
        });

      if (counts.length > 0) {
        const graphUri = buildGraphUri(adminUnit.id);
        await deleteIfRecordsTodayExist(progress, graphUri, 'GoverningBodyCountReport');
        await performInsert('GoverningBodyCountReport', writeCountReportQuery, {
          prefixes: PREFIXES,
          govBodyUri: reportUri,
          createdAt: now(),
          reportUri,
          reportGraphUri: graphUri,
          adminUnitUri: adminUnit.uri,
          prefLabel: `Count report for governing body of class ${adminUnit.classification == AdminUnitClass.Municipality ? 'gemeente' : 'provincie'} on ${defaultedDay} for admin unit '${adminUnit.label}'`,
          classLabel:
            adminUnit.classification == AdminUnitClass.Municipality ? 'gemeente' : 'provincie',
          day: defaultedDay,
          uuid: reportUuid,
          counts,
        });
        progress.update(`✅ Governing body report inserted for ${adminUnit.label}`);
      }

      return reportUri;
    } catch (error) {
      console.error(`❌ Error inserting governing body report for ${adminUnit.label}:`, error);
      progress.update(`❌ Error inserting governing body report for ${adminUnit.label}.`);
      throw error;
    }
  };

  async function performCountForGoverningBody(
    governingBodies: GoverningBodyRecord[],
    countQueries: CountQueries,
    defaultedDay: DateOnly
  ) {
    const results: Record<string, CountResult> = {};
    const bestuursorganenUris = governingBodies.map((gb) => gb.uri);

    const countConfigs = [
      { label: 'Zitting', query: countQueries.countSessionsQuery },
      { label: 'Agendapunt', query: countQueries.countAgendaItemsQuery },
      { label: 'AgendapuntTitle', query: countQueries.countAgendaItemsWithoutTitleQuery },
      {
        label: 'AgendapuntDescription',
        query: countQueries.countAgendaItemsWithoutDescriptionQuery,
      },
      { label: 'Besluit', query: countQueries.countResolutionsQuery },
      { label: 'Stemming', query: countQueries.countVoteQuery },
      { label: 'AgendapuntDuplicates', query: countQueries.countDuplicateAgendaItemsQuery },
    ];

    for (const { label, query } of countConfigs) {
      try {
        results[label] = await performCount(label, query, {
          prefixes: PREFIXES,
          from: defaultedDay.localStartOfDay,
          to: defaultedDay.localEndOfDay,
          bestuursorganen: bestuursorganenUris,
        });

        if (label === 'Zitting' && results[label].count === 0) {
          progress.update(`⚠️ No sessions (Zitting) found for governing body.`);
          break;
        }
      } catch (error) {
        console.error(`❌ Error performing count for ${label}:`, error);
        progress.update(`❌ Error performing count for ${label}.`);
        if (label === 'Zitting') break;
      }
    }

    return results;
  }

  async function processAdminUnitAcrossEndpoints(
    adminUnit: AdminUnitRecord,
    endpoint: string
  ): Promise<string[]> {
    const governingBodyReportUris: string[] = [];
    const countQueries = getQueriesForAnalysis(queryEngine, endpoint);

    try {
      const results = await performCountForGoverningBody(
        adminUnit.govBodies,
        countQueries,
        defaultedDay
      );
      progress.update(
        `📊 Counts for ${adminUnit.label}: Sessions=${results?.Zitting?.count ?? 0}, Agendapunt=${results?.Agendapunt?.count ?? 0}`
      );

      const reportUri = await insertGoverningBodyReport(adminUnit, results, defaultedDay);
      governingBodyReportUris.push(reportUri);
    } catch (error) {
      console.error(
        `❌ Error processing admin unit ${adminUnit.label} for endpoint ${endpoint}:`,
        error
      );
      progress.update(`❌ Error processing admin unit ${adminUnit.label}.`);
    }

    progress.update(
      `✅ Completed processing admin unit ${adminUnit.label} for endpoint ${endpoint}`
    );
    return governingBodyReportUris;
  }

  async function writeAdminUnitReports() {
    for (const [harvesterUrl, adminUnits] of Object.entries(harvesterAdminUnitMap)) {
      progress.update(
        `📡 Processing harvester: ${harvesterUrl} with ${adminUnits.length} admin units.`
      );

      let unitIndex = 0;
      const totalUnits = adminUnits.length;
      for (const adminUnit of adminUnits) {
        unitIndex++;
        try {
          const governingBodyReportUris = await processAdminUnitAcrossEndpoints(
            adminUnit,
            harvesterUrl
          );

          const uuid = uuidv4();
          await performInsert('AdminUnitCountReport', writeAdminUnitCountReportQuery, {
            prefixes: PREFIXES,
            reportGraphUri: buildGraphUri(adminUnit.id),
            adminUnitUri: adminUnit.uri,
            prefLabel: `Count report for admin unit '${adminUnit.label}' on ${defaultedDay}`,
            reportUri: `${config.env.URI_PREFIX_RESOURCES}${uuid}`,
            uuid,
            createdAt: now(),
            day: defaultedDay,
            reportUris: governingBodyReportUris,
          });

          progress.update(
            `✅ Completed processing admin unit ${adminUnit.label} for endpoint ${harvesterUrl} (${unitIndex}/${totalUnits})`
          );
        } catch (error) {
          console.error(`❌ Error writing admin unit report for ${adminUnit.label}:`, error);
          progress.update(`❌ Error writing admin unit report for ${adminUnit.label}.`);
        }
      }
    }
  }

  await writeAdminUnitReports();
};

import { v4 as uuidv4 } from 'uuid';
import { AdminUnitRecord, GoverningBodyRecord } from '../../job/get-org-data.js';
import { JobFunction } from '../../job/job.js';
import { PREFIXES } from '../../local-constants.js';
import { queryEngine } from '../../queries/query-engine.js';
import { TemplatedInsert, TemplatedSelect } from '../../queries/templated-query.js';
import { DateOnly, now } from '../../util/date-time.js';
import { duration } from '../../util/util.js';
import { config, EndpointConfig } from '../../configuration.js';

import { getQueriesForAnalysis, getQueriesForWriting } from './helpers.js';
import { CountQueries, CountResult, Endpoint } from './types.js';
import { deleteIfRecordsTodayExist } from '../../queries/helpers.js';
import { getHarvesterAdminUnits } from '../../helpers/merge-admin-units.js';

/**
 * Job function counting resources.
 * @param progress Default progress object passed to any job function
 * @param day The day of the year this job needs to take into account. The report only takes into account the published resources of a single day. Default value is today.
 */
export const generateReportsDaily: JobFunction = async (
  progress,
  day: DateOnly | undefined = undefined
) => {
  const defaultedDay = day ?? config.env.OVERRIDE_DAY ?? DateOnly.today();
  if (!config.env.INITIAL_SYNC) {
    progress.update(`Report function invoked with day ${defaultedDay.toString()}`);
  }
  // Init some functions making use of the progress
  async function performCount<I extends Record<string, any>, O extends Record<string, any>>(
    resource: string,
    query: TemplatedSelect<I, O>,
    input: I
  ): Promise<O> {
    const result = await duration(query.result.bind(query))(input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    if (result.result.count !== 0) {
      progress.update(
        `Performed count query for resource "${resource}" in ${result.durationMilliseconds} ms. Returned ${result.result.count}.`
      );
    }

    return result.result;
  }
  async function performInsert<I extends Record<string, any>>(
    resource: string,
    query: TemplatedInsert<I>,
    input: I
  ): Promise<void> {
    const result = await duration(query.execute.bind(query))(input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    progress.update(`Written '${resource}' in ${result.durationMilliseconds} ms`);
  }
  const { countAdminUnits, harvesterAdminUnitMap } = await getHarvesterAdminUnits(queryEngine);

  progress.update(
    `📡 Got ${countAdminUnits} admin units. Fetching harvest timestamps from harvesters...`
  );
  const queryCount = countAdminUnits * config.file.endpoints.length;
  progress.progress(0, queryCount);
  progress.update(
    `Got org resources. ${queryCount} queries to perform for ${countAdminUnits} admin units for ${config.file.endpoints.length} endpoints.`
  );
  let queries = 0;
  const { writeCountReportQuery, writeAdminUnitCountReportQuery } = getQueriesForWriting(
    queryEngine,
    config.env.REPORT_ENDPOINT
  );

  async function insertGoverningBodyReport(
    adminUnit: AdminUnitRecord,
    results: Record<string, CountResult>,
    defaultedDay: DateOnly
  ): Promise<string> {
    try {
      const uuid = uuidv4();
      const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
      const result = Object.entries(results).filter(([_, result]) => result.count !== 0);
      const uuids = new Array(result.length).fill(null).map(() => uuidv4());

      const counts = result.map(([label, result], index) => ({
        countUri: `${config.env.URI_PREFIX_RESOURCES}${uuids[index]}`,
        uuid: uuids[index],
        classUri: `http://data.vlaanderen.be/ns/besluit#${label}`,
        count: result.count,
        prefLabel: `Count of '${label}'`,
      }));

      if (counts.length > 0) {
        const graphUri = `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DMGEBRUIKER`;
        await deleteIfRecordsTodayExist(progress, graphUri, 'GoverningBodyCountReport');
        await performInsert('GoverningBodyCountReport', writeCountReportQuery, {
          prefixes: PREFIXES,
          govBodyUri: reportUri,
          createdAt: now(),
          reportUri,
          reportGraphUri: `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DMGEBRUIKER`,
          adminUnitUri: adminUnit.uri,
          prefLabel: `Count report for governing body of class Gemeente on ${defaultedDay} for admin unit '${adminUnit.label}'`,
          classLabel: 'Gemeente',
          day: defaultedDay,
          uuid,
          counts,
        });
      }

      return reportUri;
    } catch (error) {
      console.error(
        `Error inserting governing body report for  in admin unit "${adminUnit.label}":`,
        error
      );
      progress.update(
        `Error inserting governing body report for  in admin unit "${adminUnit.label}".`
      );
      throw error;
    }
  }

  async function processAdminUnitAcrossEndpoints(
    adminUnit: AdminUnitRecord,
    endpoints: Endpoint[],
    defaultedDay: DateOnly
  ): Promise<string[]> {
    const governingBodyReportUriList: string[] = [];

    for (const endpoint of endpoints) {
      try {
        const countQueries = getQueriesForAnalysis(queryEngine, endpoint.url);
        try {
          const results = await performCountForGoverningBody(
            adminUnit.govBodies,
            countQueries,
            defaultedDay
          );
          if (!results || !results.Zitting || results.Zitting.count === 0) {
            progress.update(
              `Skipping insertion for "${adminUnit.label}": because Zitting count = 0.`
            );
            continue;
          }
          progress.update(
            `Sessions: ${results?.Zitting?.count ?? 0}, Agendapunt: ${results?.Agendapunt?.count ?? 0}, AgendapuntTitle: ${results?.AgendapuntTitle?.count ?? 0}, AgendapuntDescription: ${results?.AgendapuntDescription?.count ?? 0}, Besluit: ${results?.Besluit?.count ?? 0}, Stemming: ${results?.Stemming?.count ?? 0}`
          );
          const graphUri = `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DMGEBRUIKER`;
          await deleteIfRecordsTodayExist(progress, graphUri, 'AdminUnitCountReport');
          const reportUri = await insertGoverningBodyReport(adminUnit, results, defaultedDay);
          governingBodyReportUriList.push(reportUri);
        } catch (error) {
          console.error(`Error processing results for admin unit "${adminUnit.label}".`, error);
          progress.update(`Error processing results for admin unit "${adminUnit.label}".`);
        }

        progress.update(
          `All reports processed for endpoint "${endpoint.url}" for admin unit "${adminUnit.label}"`
        );
      } catch (error) {
        console.error(
          `Error processing admin unit "${adminUnit.label}" for endpoint "${endpoint.url}":`,
          error
        );
        progress.update(
          `Error processing admin unit "${adminUnit.label}" for endpoint "${endpoint.url}".`
        );
      }
    }
    return governingBodyReportUriList;
  }

  async function performCountForGoverningBody(
    governingBodies: GoverningBodyRecord[],
    countQueries: CountQueries,
    defaultedDay: DateOnly
  ) {
    const results: Record<string, CountResult> = {};

    try {
      const {
        countSessionsQuery,
        countAgendaItemsQuery,
        countAgendaItemsWithoutTitleQuery,
        countAgendaItemsWithoutDescriptionQuery,
        countResolutionsQuery,
        countVoteQuery,
      } = countQueries;

      const countConfigs = [
        { type: 'Session', query: countSessionsQuery, label: 'Zitting' },
        { type: 'AgendaPunt', query: countAgendaItemsQuery, label: 'Agendapunt' },
        {
          type: 'AgendapuntTitle',
          query: countAgendaItemsWithoutTitleQuery,
          label: 'AgendapuntTitle',
        },
        {
          type: 'AgendapuntDescription',
          query: countAgendaItemsWithoutDescriptionQuery,
          label: 'AgendapuntDescription',
        },
        { type: 'Besluit', query: countResolutionsQuery, label: 'Besluit' },
        { type: 'Stemming', query: countVoteQuery, label: 'Stemming' },
      ];

      const noFilterForDebug = config.env.INITIAL_SYNC;
      const bestuursorganenUris = governingBodies.map((gb) => gb.uri);

      for (const { type, query, label } of countConfigs) {
        try {
          results[label] = await performCount(type, query, {
            prefixes: PREFIXES,
            from: defaultedDay.localStartOfDay,
            to: defaultedDay.localEndOfDay,
            noFilterForDebug,
            bestuursorganen: bestuursorganenUris,
          });

          if (label === 'Zitting' && results[label].count === 0) {
            break;
          }
        } catch (error) {
          console.error(`Error performing count for ${label} in :`, error);
          progress.update(`Error performing count for ${label} in governing body .`);
          if (label === 'Zitting') break;
        }
      }
    } catch (error) {
      console.error(`Unexpected error while counting for governing body :`, error);
      progress.update(`Unexpected error while counting for governing body .`);
    }
    return results;
  }

  await writeAdminUnitReports(config.file.endpoints, defaultedDay);

  async function writeAdminUnitReports(endpoints: EndpointConfig[], defaultedDay: DateOnly) {
    for (const [harvesterUrl, adminUnits] of Object.entries(harvesterAdminUnitMap)) {
      progress.update(
        `📡 Processing harvester: ${harvesterUrl} with ${adminUnits.length} admin units.`
      );

      for (const adminUnit of adminUnits) {
        try {
          const uuid = uuidv4();
          const governingBodyReportUriList = await processAdminUnitAcrossEndpoints(
            adminUnit,
            endpoints,
            defaultedDay
          );
          progress.update(
            `Got ${governingBodyReportUriList.length} governing body report uris for admin unit ${adminUnit.label}`
          );
          await performInsert('AdminUnitCountReport', writeAdminUnitCountReportQuery, {
            prefixes: PREFIXES,
            reportGraphUri: `${config.env.REPORT_GRAPH_URI}${adminUnit.id}/DMGEBRUIKER`,
            adminUnitUri: adminUnit.uri,
            prefLabel: `Count report for admin unit '${adminUnit.label}' on ${defaultedDay}`,
            reportUri: `${config.env.URI_PREFIX_RESOURCES}${uuid}`,
            uuid,
            createdAt: now(),
            day: defaultedDay,
            reportUris: governingBodyReportUriList,
          });
        } catch (error) {
          console.error(`Error processing admin unit ${adminUnit.label}:`, error);
        }
      }
    }
  }
};

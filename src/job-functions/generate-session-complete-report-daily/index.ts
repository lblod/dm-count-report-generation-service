import { QueryEngine } from "@comunica/query-sparql";
import { v4 as uuidv4 } from "uuid";
import { config } from "../../configuration.js";
import { getOrgResoucesCached } from "../../job/get-org-data.js";
import { JobFunction } from "../../job/job.js";
import { PREFIXES } from "../../local-constants.js";
import { queryEngine } from "../../queries/query-engine.js";
import {
  TemplatedInsert,
  TemplatedSelect,
} from "../../queries/templated-query.js";
import { DateOnly, now } from "../../util/date-time.js";
import { duration } from "../../util/util.js";
import {
  AnalyseAgendaItemsInput,
  AnalyseAgendaItemsOutput,
  BadAgendaItemInput,
  CountSessionUnitsPerAdminUnitOutput,
  CountSessionsPerAdminUnitInput,
  GetSessionsInput,
  GetSessionsOuput,
  SessionCheckReportInput,
  WriteAdminUnitReportInput,
  WriteGoveringBodyReportInput,
  analyseAgendaItemsTemplate,
  countSessionsPerAdminUnitTemplate,
  getSessionsTemplate,
  writeAdminUnitReportTemplate,
  writeGoverningBodyReportTemplate,
} from "./queries.js";

function getQueriesForWriting(queryEngine: QueryEngine, endpoint: string) {
  const writeGoverningBodyReportQuery =
    new TemplatedInsert<WriteGoveringBodyReportInput>(
      queryEngine,
      endpoint,
      writeGoverningBodyReportTemplate
    );
  const writeAdminUnitReportQuery =
    new TemplatedInsert<WriteAdminUnitReportInput>(
      queryEngine,
      endpoint,
      writeAdminUnitReportTemplate
    );
  return {
    writeGoverningBodyReportQuery,
    writeAdminUnitReportQuery,
  };
}

function getQueriesForAnalysis(queryEngine: QueryEngine, endpoint: string) {
  const getSessionsQuery = new TemplatedSelect<
    GetSessionsInput,
    GetSessionsOuput
  >(queryEngine, endpoint, getSessionsTemplate);
  const analyseAgendaItemsQuery = new TemplatedSelect<
    AnalyseAgendaItemsInput,
    AnalyseAgendaItemsOutput
  >(queryEngine, endpoint, analyseAgendaItemsTemplate);

  return {
    getSessionsQuery,
    analyseAgendaItemsQuery,
  };
}

function extractDocuments(
  queryObject: AnalyseAgendaItemsOutput | undefined
): string[] {
  if (!queryObject) return [];
  if (Array.isArray(queryObject.documentUri)) {
    return queryObject.documentUri;
  }
  if (typeof queryObject.documentUri === "string") {
    return [queryObject.documentUri];
  }
  return [];
}

function someIncludes(list: string[], word: string): boolean {
  return list.some((s) => s.includes(word));
}

/**
 * Job function counting resources. This is a PoC.
 * @param progress Default progress object passed to any job function
 * @param day The day of the year this job needs to take into account. The report only takes into account the published resources of a single day. Default value is yesterday.
 */
export const generateReportsDaily: JobFunction = async (
  progress,
  day: DateOnly | undefined = undefined
) => {
  const defaultedDay = day ?? DateOnly.yesterday();
  progress.update(
    `Document presence check report function invoked with day ${defaultedDay.toString()}`
  );
  progress.update(`Getting org resources`);
  const orgResources = await getOrgResoucesCached(queryEngine);

  // First we determine the total amount of queries to be done
  let queryCount = 0;
  let queries = 0;
  let governingBodiesCount = 0;

  for (const endpoint of config.file.endpoints) {
    const countSessionsQuery = new TemplatedSelect<
      CountSessionsPerAdminUnitInput,
      CountSessionUnitsPerAdminUnitOutput
    >(queryEngine, endpoint.url, countSessionsPerAdminUnitTemplate);
    for (const adminUnit of orgResources.adminUnits) {
      const sessionCountRecords = await countSessionsQuery.records({
        prefixes: PREFIXES,
        governingBodyUris: adminUnit.govBodies.map((gb) => gb.uri),
        noFilterForDebug: config.env.NO_TIME_FILTER,
        from: defaultedDay.localStartOfDay,
        to: defaultedDay.localEndOfDay,
      });
      queryCount += adminUnit.govBodies.length; // Write gov unit report body report
      governingBodiesCount += adminUnit.govBodies.length;
      for (const sessionCountRecord of sessionCountRecords) {
        queryCount += sessionCountRecord.sessionCount; // One query per session
      }
      queryCount++; // Write admin unit report body report
    }
  }
  // End of determining total query count

  progress.progress(0, queryCount);
  progress.update(
    `Got org resources. ${queryCount} queries to perform for ${governingBodiesCount} governing bodies and ${orgResources.adminUnits.length} admin units for ${config.file.endpoints.length} endpoints.`
  );
  // Helper function
  async function performInsert<I extends Record<string, any>>(
    resource: string,
    query: TemplatedInsert<I>,
    input: I
  ): Promise<void> {
    const result = await duration(query.execute.bind(query))(input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    progress.update(
      `Written '${resource}' in ${result.durationMilliseconds} ms`
    );
  }

  async function performSelectObjects<
    I extends Record<string, any>,
    O extends Record<string, any>
  >(query: TemplatedSelect<I, O>, uriKey: string, input: I): Promise<O[]> {
    const result = await duration(query.objects.bind(query))(uriKey, input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    progress.update(
      `Performed select query in ${result.durationMilliseconds} ms. Returned ${result.result.length} objects.`
    );
    return result.result;
  }
  async function performSelectRecords<
    I extends Record<string, any>,
    O extends Record<string, any>
  >(query: TemplatedSelect<I, O>, input: I): Promise<O[]> {
    const result = await duration(query.records.bind(query))(input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    progress.update(
      `Performed select query in ${result.durationMilliseconds} ms. Returned ${result.result.length} Records.`
    );
    return result.result;
  }
  async function performSelectResult<
    I extends Record<string, any>,
    O extends Record<string, any>
  >(query: TemplatedSelect<I, O>, input: I): Promise<O> {
    const result = await duration(query.result.bind(query))(input);
    progress.progress(++queries, queryCount, result.durationMilliseconds);
    progress.update(
      `Performed select query (one row) in ${result.durationMilliseconds} ms. Returned a result.`
    );
    return result.result;
  }

  const { writeGoverningBodyReportQuery, writeAdminUnitReportQuery } =
    getQueriesForWriting(queryEngine, config.env.REPORT_ENDPOINT);
  // Now perform the query machine gun
  for (const endpoint of config.file.endpoints) {
    const { getSessionsQuery, analyseAgendaItemsQuery } = getQueriesForAnalysis(
      queryEngine,
      endpoint.url
    );

    for (const adminUnit of orgResources.adminUnits) {
      const governingBodyReportUriList: string[] = [];
      // TODO: make a catalog of query machines for each resource type eventually
      let badGoverningBodies = 0;
      for (const goveringBody of adminUnit.govBodies) {
        const newSessions = await performSelectRecords(getSessionsQuery, {
          prefixes: PREFIXES,
          governingBodyUri: goveringBody.uri,
          noFilterForDebug: config.env.NO_TIME_FILTER,
          from: defaultedDay.localEndOfDay,
          to: defaultedDay.localEndOfDay,
        });

        const sessionCheckReports: SessionCheckReportInput[] = [];
        let badSessions = 0;

        for (const sessionRecord of newSessions) {
          // For each session we need to check which URL's are present with all the associated agenda items
          const agendaItems = await performSelectObjects(
            analyseAgendaItemsQuery,
            "agendaItemUri",
            {
              prefixes: PREFIXES,
              sessionUri: sessionRecord.sessionUri,
            }
          );
          progress.progress(queries++, queryCount);
          // For each agenda item; check what url's are present.
          // If an agenda item is NOT ok then add it to the list of bad agenda items of this session
          const urls = new Set<string>();
          const badAgendaItems: BadAgendaItemInput[] = [];
          for (const agendaItemQueryResult of agendaItems) {
            const agendaItemUrls = extractDocuments(agendaItemQueryResult);

            const hasResolutions = someIncludes(
              agendaItemUrls,
              "besluitenlijst"
            );
            const hasAgenda = someIncludes(agendaItemUrls, "agendapunten");
            const hasNotes = someIncludes(agendaItemUrls, "notulen");
            const hasAllDocuments = hasResolutions && hasAgenda && hasNotes;

            if (!hasAllDocuments) {
              const uuid = uuidv4();
              const agendaItemCheckUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
              badAgendaItems.push({
                agendaItemCheckUri,
                uuid,
                hasAgenda,
                hasNotes,
                hasResolutions,
                urls: agendaItemUrls,
              });
            }
            agendaItemUrls.forEach((u) => urls.add(u));
          }
          // Done checking agenda items
          const uuid = uuidv4();
          const sessionCheckUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
          const ok = badAgendaItems.length === 0;
          const reportLabel = ok
            ? `All agenda items (${agendaItems.length}) have associed notes, resolutions and agenda item documents.`
            : `Not all agenda items habe associated notes, resolutions and agenda item documents. ${badAgendaItems.length} of ${agendaItems.length} are incomplete.`;
          sessionCheckReports.push({
            sessionCheckUri,
            uuid,
            documentsPresent: ok,
            urls: [...urls],
            badAgendaItems,
            prefLabel: `Document presence check of session with uuid "${sessionRecord.uuid}": ${reportLabel}`,
            sessionUri: sessionRecord.sessionUri,
          });

          if (!ok) badSessions++;
        }
        // Done checking session

        const uuid = uuidv4();
        const reportUri = `${config.env.URI_PREFIX_RESOURCES}${uuid}`;
        governingBodyReportUriList.push(reportUri);

        // Write govering body report
        await performInsert(
          "GoverningBodyDocumentPresenceCheckReport",
          writeGoverningBodyReportQuery,
          {
            prefixes: PREFIXES,
            reportGraphUri: config.env.REPORT_GRAPH_URI,
            reportUri,
            createdAt: now(),
            day: defaultedDay,
            govBodyUri: goveringBody.uri,
            adminUnitUri: adminUnit.uri,
            prefLabel: `Document presence check of all new sessions associated with the governing body "${goveringBody.classLabel}" of admin unit "${adminUnit.label}".`,
            uuid,
            totalSessions: sessionCheckReports.length,
            totalBadSessions: badSessions,
            sessionCheckReports,
          }
        );
        progress.progress(queries++, queryCount);

        if (badSessions > 0) badGoverningBodies++;
      }
      // Write admin unit report
      const uuid = uuidv4();
      await performInsert(
        "AdminUnitDocumentPresenceCheckReport",
        writeAdminUnitReportQuery,
        {
          prefixes: PREFIXES,
          reportGraphUri: config.env.REPORT_GRAPH_URI,
          adminUnitUri: adminUnit.uri,
          prefLabel: `Session document present check reportfor admin unit '${adminUnit.label}' on ${defaultedDay}`,
          reportUri: `${config.env.URI_PREFIX_RESOURCES}${uuid}`,
          uuid,
          createdAt: now(),
          day: defaultedDay,
          totalBadGoverningBodies: badGoverningBodies,
          reportUris: governingBodyReportUriList,
        }
      );
      progress.progress(queries++, queryCount);
      // Done writing admin unit
    }
    progress.update(
      `All document presence reports written for endpoint "${endpoint.url}"`
    );
  }
};

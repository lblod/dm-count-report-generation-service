import { config } from '../configuration.js';
import { compileSparql } from '../handlebars/index.js';
import { JobProgress } from '../job/job.js';
import { PREFIXES } from '../local-constants.js';
import { DateOnly } from '../util/date-time.js';
import { queryEngine } from './query-engine.js';
import { TemplatedInsert, TemplatedSelect } from './templated-query.js';

export const checkTodayRecordsTemplate = compileSparql(
  `\
{{prefixes}}

SELECT ?report WHERE {
  GRAPH {{toNode graphUri}} {
    ?report a datamonitoring:{{classType}} ;
            datamonitoring:createdAt ?createdAt .

    FILTER (strstarts(str(?createdAt), "{{date}}"))
  }
}
`
);

export const deleteTodayRecordsTemplate = compileSparql(
  `\
{{prefixes}}

DELETE {
  GRAPH {{toNode graphUri}} {
    ?report ?p ?o .
    ?s ?pp ?report .
  }
}
WHERE {
  GRAPH {{toNode graphUri}} {
    ?report a datamonitoring:{{classType}} ;
            datamonitoring:createdAt ?createdAt .

    FILTER (strstarts(str(?createdAt), "{{date}}"))

    OPTIONAL { ?report ?p ?o }
    OPTIONAL { ?s ?pp ?report }
  }
}
`
);

export async function deleteIfRecordsTodayExist(
  progress: JobProgress,
  graphUri: string,
  classType: string
) {
  const dateStr = DateOnly.today().toString();
  const checkQuery = new TemplatedSelect<
    { prefixes: string; date: string; graphUri: string; classType: string },
    { report: string }
  >(queryEngine, config.env.REPORT_ENDPOINT, checkTodayRecordsTemplate);
  const existingReports = await checkQuery.records({
    prefixes: PREFIXES,
    date: dateStr,
    graphUri: graphUri,
    classType: classType,
  });
  if (existingReports.length > 0) {
    // progress.update(`Found ${existingReports.length} reports for today. Deleting...`);

    const deleteQuery = new TemplatedInsert<{
      prefixes: string;
      date: string;
      graphUri: string;
      classType: string;
    }>(queryEngine, config.env.REPORT_ENDPOINT, deleteTodayRecordsTemplate);
    await deleteQuery.execute({
      prefixes: PREFIXES,
      date: dateStr,
      graphUri: graphUri,
      classType: classType,
    });
    console.log('Existing reports deleted.');
    progress.update('Existing reports deleted.');
  }
  return existingReports;
}

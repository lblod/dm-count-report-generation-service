# Data monitoring count report generation service

This was a microservice emulating the functionality of a future microservice to be built. It will be called `dm-report-generation-service`. This service is to be embedded in [Data monitoring](https://github.com/lblod/app-data-monitoring) which is under development.

For now this service executes experimental report generation jobs. To build `dm-report-generation-service` this service will act as a template.

The point of this microservice is to contain functionality that contacts a specific SPARQL endpoint using SPARQL queries. Multiple functions need to run automatically every night executing queries to gather information about specific resources. In this particular case the first function counts the amount of new records each day for each governing body (bestuursorgaan) of each admin unit (bestuurseenheid). Reports are written to a different SPARQL endpoint. This will not make any sense to you unless you are aware of the specific context within which ABB (Agentschap Binnenlands Bestuur) operates; which is the agency of the Flemish government this service was designed for.

So every night this service will run a procedure which targets the linked data published the day before. This nightly procedure looks as follows in pseudocode (for now).

```plaintext
FOR EACH endpoint IN endpoints:
  FOR EACH adminUnit IN adminUnits:
    FOR EACH governingbody IN adminUnit.governingBodies:
      FOR EACH resouceClass IN endpoint.resouces:
        Count new resources of the last day
      Write governing body report
    Write admin unit report
Write aggegated reports (overviews)
```

This is just the first function. As of today there are three functions in existence:

* Counting function
* Harvested time function
* Dummy function for testing

## Stack

* Node LTS/Iron (v20.12.2)
* Typescript v5.4
* Compile to ESNEXT (ES2022 or better at time of publishing)
  * Top level await and other fun stuff
* ECMAScript modules; not CommonJS
* [Comunica](https://comunica.dev/) for SPARQL stuff
* [Dayjs](https://day.js.org/) for date and time stuff
* [Handlebars](https://handlebarsjs.com/guide/) for templating of queries
* [Zod](https://zod.dev/) for schema validation of any user provided input such as configuration and query parameters
* [Winston](https://www.npmjs.com/package/winston) for logging. In this way we don't end up dumping everything in `console.log` and we have some control over the output.
* Good old [Express](https://expressjs.com/)

## Configuration

### Environment variables

| Variable name & type | Default value | Explanation |
| :--- | :--- | :--- |
| ADMIN_UNIT_ENDPOINT<br>(string, URL) | No default. Required. | URL of the SPARQL endpoint where the reporting service can query for admin units and governing bodies. Typically ending in `/sparql`. The value can be identical to REPORT_ENDPOINT but it needs to be provided nonetheless. |
| REPORT_ENDPOINT<br>(string, URL) | No default. Required. | Url of the SPARQL endpoint where the reporting service can write reports to. The value can be identical to ADMIN_UNIT_ENDPOINT but it needs to be provided nonetheless. |
| DISABLE_DEBUG_ENDPOINT<br>(boolean) | `"true"` | False activates endpoints which can be used for testing. See discussion below. In production these endpoint should be disabled (the default value). |
| REPORT_GRAPH_URI<br>(string, URI) | `"http://mu.semte.ch/graphs/public"` | The URI of the graph where to write report related linked data to. |
| CONFIG_FILE_LOCATION<br>(string, directory) | `"/config"` | The directory where the config file can be found. Useful for development. Default value is the normal location in the container. For local testing you may point to a folder on your host's filesystem containing a specific configuration.  |
| SLEEP_BETWEEN_QUERIES_MS<br>(integer) | `0` | Value in milliseconds. Setting this higher than 0 means the service will wait the specified number of milliseconds after each query before the next query. This may be needed in order to prevent the service from overloading the database. |
| SHOW_SPARQL_QUERIES<br>(boolean) | `"false"` | Set to true to print the queries to the console (`verbose` log level). Prefixes are not printed for successful queries. |
| LIMIT_NUMBER_ADMIN_UNITS<br>(integer) | `0` | 0 Means query for all admin units. A non zero value imposes a limit. This is useful for testing so you don't flood the database and or test quicker. I'd suggest you set it to 5 for testing in which case only 5 admin units will be loaded to perform analysis on. |
| ORG_RESOURCES_TTL_S<br>(number) | `300` | Value in seconds. Data concerning admin units and governing bodies are kept in a cache with a Time To Live (TTL). This prevents unnecessary load during repeated test invocations of report generation. After this time has elapsed the cache is cleared and new data needs to be queried. |
| SERVER_PORT<br>(number) | `80` | HTTP port the server listens on. For debugging locally I suggest port 4199. |
| LOG_LEVEL<br>(string) | `"info"` | Level of the logs. Accepted values are "error","warn","info","http","verbose","debug" and "silly". For production set to "error". For development set to "info", "debug" or "silly" depending on your preference. |
| NO_TIME_FILTER<br>(boolean) | `"false"` | Set to true in some test cases. This disabled the date related filtering when counting. This can be useful when no new data was posted and too many queries yield 0. |
| DUMP_FILES_LOCATION<br>(string, directory) | `"/dump"` | Only relevant if DISABLE_DEBUG_ENDPOINT is `false`. This specifies the directory where the service will save the dump files for debugging. Typically this is a docker volume. |
| QUERY_MAX_RETRIES<br>(number) | `3` | Amount of times the making a query is retried. |
| QUERY_WAIT_TIME_ON_FAIL_MS<br>(number) | `1000` | Amount of time in milliseconds to wait after a query has failed before retrying. |
| ROOT_URL_PATH<br>(string, url path) | `""` | When generating absolute url paths this root path will be pasted at the beginning of the url path. Example: if ROOT_PATH is `/counting-service` then the queue debug endpoint will have the following link: `https://<domain>/counting-service/queue`. The value needs to start with a slash. And empty string is also acceptable for local testing in which case the queue endpoint is `http://localhost:<port>/queue`. |
| ADD_DUMMY_REST_JOB_TEMPLATE<br>(boolean) | `"false"` | If true a dummy rest job template will be added. This is useful to test the execution logic of this microservice. Any jobs of type 'serial' should never be executed in parallel. |
| SKIP_ENDPOINT_CHECK<br>(boolean) | `"false"` | If true the test checking if all SPARQL endpoints respond will be skipped. In production this should be 'true' because it's important to know of endpoints are up before starting operations. |

* Boolean: "true" for `true`, "false" for `false`.

The program will validate the environment variables before running. If you made a mistake the program will stop until you fix the error. An error could be providing a string where a number is expected or a faulty value for a boolean.

### Configuration JSON file

When using this service you'll need to make a volume that links a directory to the `/config` directory in the container. This directory should contain a `config.json` file. The contents should look like this:

```JSON
{
  "$schema": "https://raw.githubusercontent.com/lblod/dm-count-report-generation-service/master/config-schema.json",
  "endpoints": [
    {
      "url":"...",
      "classes": [
        "besluit:Besluit",
        "besluit:Agendapunt",
        ...
      ]
    },
    ...
  ],
  "harvester-endpoints": [
    {
      "url": "...",
    },
    ...
  ],
  "periodic-function-invocation-times": {
    "COUNT_RESOURCES": {
      "time": "00:00",
      "days": "monday,tuesday,wednesday,thursday,friday,saturday,sunday"
    },
    "CHECK_HARVESTING_EXECUTION_TIME": {
      "time": "00:00",
      "days": "monday,tuesday,wednesday,thursday,friday,saturday,sunday"
    }
  }
}
```
* `"endpoints"`:
Contains a list of endpoints specifying a SPARQL endpoint URL and a list of resources to count in the counting task. Both short notations of URI's and full ones are supported.

* `"harvester-endpoints"`:
Contains a list of harvester SPARQL endpoints for the last harvested task

* `"periodic-function-invocation-times"`:
An object modeling a record. The key needs to be a name of a data monitoring function and the value is another object containing a time and a comma separated list of days. The service will create periodic job templates automatically when they are not present in accordance with these definitions. When they are already present the microservice will NOT change them because they are ment to be changed by updating the job records using a delta message. Delta message processing has not been developed yet.

There is a JSON schema so you should not make any mistaktes. If you do mess up the schema though the program will crash on startup and you'll get a slap on the wrist. If I messed up the schema please let me know.

## Testing

### Running locally

You'll need node v20.12.2 or higher. I suggest using [NVM](https://github.com/nvm-sh/nvm). If you do use NVM you can run:

1. `nvm install lts/iron`
2. `nvm use lts/iron`

To run locally:

1. Clone the repo
2. Run `npm install` in the folder
3. Change the file `env-dev` to your preferences.
4. Set the `CONFIG_FILE_LOCATION` env var to `"./test-config"` and add the folter in your repo. Make a file called config.json in this folder with the appropriate configuration. Make sure to copy the `$schema` key and value shown above in order to prevent mistakes.
5. Run `npm run dev` and nodemon will start. It will run the service using [tsx](https://github.com/privatenumber/tsx).

VSCode users can use the debugger. Again make sure `env-dev` is adapted to your circumstance and press play in the debugger sidebar in VSCode. This applies only to VSCode users.

### Running from a container

Adapt the environment variables in the `run` file. Then run it `./run`. Make sure you have docker installed

It will build the image and then spin up a container. There will be strict type checking during building.

## Debugging and triples memory store

When running the node process locally or when running the container you can use the browser to contact debug endpoints (`DISABLE_DEBUG_ENDPOINT` needs to be set to `"false"`).

To check the current catalog of functions visit:

* `http://localhost:4199/debug` (Port 4199 is an example. Set the port value using `SERVER_PORT`. When running on localhost the `ROOT_URL_PATH` needs to be `""`)

When `DISABLE_DEBUG_ENDPOINT` is set to `false` all of the triples created with INSERT queries will be stored in memory during runtime. See the debug page. It contains a link to trigger a GET request which makes a TTL triples dump of all the triples you have inserted. This is useful for testing purposes.

## Developing this service further and background

### The templated query system

If you wish to change the queries and/or add query invocations you'll need to know how the templated query system works.

In order to write a new query add one in `report-generation/queries.ts` or another file.

First write a query using [handlebars](https://handlebarsjs.com/) like this:

```typescript
export const mySelectQueryTemplate = Handlebars.compile(`\
{{prefixes}}

SELECT ?resourceUri ?label WHERE {
  ?resourceUri a <{{classUri}}>;
    skos:prefLabel ?label;
    example:day {{toDateLiteral day}};
    example:time ?time;
    example:fixedTextObjectExamplePredicate {{escape stringValueWithQuotes}}.
}
`, { noEscape:true });
```

DON'T forget the 'noEscape: true' part. This is not HTML and we don't want HTML encoding.

It's important to add two typescript types together with a SELECT query and export them: one for the input and one for the output. For INSERT queries you will only need an input type.

The input is what will be passed to the handlebars templating system. In this case:

```typescript
export type MySelectQueryInput = {
  prefixes: string;
  classUri: string;
  day: DateOnly;
  stringValueWithQuotes: string; // If this string contains quotes they need to be escaped...
  // ... using the 'escape' helper function.
}
```

Include ANY variable referenced in the template in the input type. In many cases you will need a literal helper function which converts the variable to a string with a valid RDF literal (shaped like `"serialnotation"^^"xsd:Type"`). Whenever you expect the user of your query to input an URI make sure to use `uri` in the name. In the future we may use RDFJS integration but now it's pure text wrangling.

Feel free to use types like 'DateOnly' of 'TimeOnly' or some enums. To format specific types of variables to the correct SPARQL format you'll need these helpers in the query:

| Variabele type | Helper | Type Notation in typescript | Handlebars notation |
| :--- | :--- | :--- | :--- |
| `DateOnly` | `toDateLiteral` | `exampleDate:DateOnly;` | `{{toDateLiteral exampleDate}}` |
| `TimeOnly` | `toTimeLiteral` | `exampleTime:TimeOnly;` | `{{toDateLiteral exampleTime}}` |
| `DateTime` | `toDateTimeLiteral` | `exampleDateTime:DayJs;` | `{{toDateTimeLiteral exampleDateTime}}` |
| `JobStatus` | `toJobStatusLiteral` | `exampleStatus:JobStatus;` | `{{toJobStatusLiteral exampleStatus}}` |

The last row in the table is an enum value. Other enums such as `JobType`, `JobStatus`, `JobTemplateType`, `JobTemplateStatus`, `DayOfWeek` and `DatamonitoringFunction` are also supported in a similar way.

The output is linked to the selected variables after the `SELECT` keyword. In this case.

```typescript
export type MySelectQueryOutput = {
  resourceUri: string;
  label: string;
  timeOfDay: TimeOnly;
}
```

In this type structure you can also use TimeOnly, DateOnly, DateTime(Dayjs)(modeling a timestamp) and enums. When parsing the bindings after invoking the `objects` or `records` method of the `TemplatedSelect` instance will automatically convert the variables to the correct type because the linked data has type information. Of course you can just use strings and number without helpers. Remember that Handlebars is 'dumb'. Whatever template you write will need to generate correct SPARQL. So putting URI's in your query will require you not to forget the `<` and `>` characters. When rendering plain text strings as objects please use the `escape` helper which escapes `"` and `'` like this: `{{escape stringVariable}}`.

Then, in another file where you want to execute the query, you'll instantiate the `TemplatedSelect` class.

```typescript
const mySelectQuery = new TemplatedSelect<
  MySelectQueryInput, // Input type parameter
  MySelectQueryOutput, // Output type parameter
>(
  queryEngine, // The comunica query engine. Get it from query-engine.ts module in most cases. Unless you know what your're doing
  endpoint, // URL of endpoint; typically ending in '/sparql'
  mySelectQueryTemplate, // The handlebars template you exported earlier
);
```


Now this query machine is ready to go. You can launch it in many ways:

* `await mySelectQuery.bindings(input)`: Get results as an array of comunica bindings.
* `await mySelectQuery.records(input)`: Get results as an array of javascript objects in the shape of `MySelectQueryOutput[]` in the example. In this case reach result row is one record.
* `await mySelectQuery.objects('resourceUri', input)`: Get results as an array of javascript objects in the shape of `MySelectQueryOutput[]` in the example. It outputs one object per unique value of `resourceUri`.
* `await mySelectQuery.result(input)`: Identical to records except it returns one and one record only. Useful for count queries. Will throw when more then one or 0 rows are returned.

The `objects(uriKey, input)` method needs to map the bindings onto a list of objects modeling resources. In order to do that it needs a key that is the URI of the resource being returned as the first parameter. Now we can perform the query using the objects function and get results.

```typescript
// Perform the query and get the results as objects. Pass the input
const result = await mySelectQuery.objects('resourceUri', {
  prefixes: PREFIXES,
  classUri: 'http://whatever.com/ns/examples/classes/Example',
  day: DateOnly.yesterday(),
});

// Print the results
for (const obj of result) {
  logger.info(`Resource <${obj.resourceUri}> with label "${obj.label}" and time of day ${obj.timeOfDay.toString()}`);
}
```

`records(input)` is an array of objects of the type `MySelectQueryOutput`. Again: Some complex objects are created automatically for you.


![](./docs/image.png)

This class works well up to tens of thousands of rows but was not really designed to handle really large amounts of rows. There is no optimization for extremely large result sets at this time. This is also not an ORM and it cannot handle relations and/or follow links. It's mostly created because this service will generate a LOT of different queries and type validation is handy at development time.

Just one little snippet to complete the example. Here's how you consume results:

```typescript
// Perform the templated query using specific input parameters
const result = await mySelectQuery.objects({
  prefixes: PREFIXES,
  classUri: "http://data.vlaanderen.be/ns/besluit#Besluit",
});
//Result is a list of objects; each modeling a resource.
```

Because of the way the templated query system was designed you should get full type checking at compile time. I hope it helps to prevent bugs.

If you have a query which returns only one row (most count queries) you can use the `result` method which does not try to map to a list of objects but just gives you one `MySelectQueryOutput` record. Be mindful that this function will throw if more then one row is returned. If you want to do your own thing just use the `bindings` function to get the result as Comunica bindings.

```typescript
// If you only want the first row do this:
const first = await mySelectQuery.result(input)
```
`INSERT` queries are similar to `SELECT` ones but give no output. They only have an input type and to invoke them you need to call the `execute` function.

For queries that ONLY insert data you should use the `TemplatedInsert` class. For queries that modify or update data you'll have to use the `TemplatedUpdate` class. The only difference between the two is that the `TemplatedInsert` class writes the triples to a memory store as well for debugging. `TemplatedUpdate` just executes queries exactly like `TemplatedInsert` but without the logging.

Example of INSERT query:

```typescript
const myInsertQuery = new TemplatedInsert<{prefixes:string}>(
  queryEngine,
  endpoint,
  myInsertQueryTemplate, // Handlebars template with only prefixes as a variabele
)
await myInsertQuery.execute({
  prefixes: PREFIXES,
});
// No output. If execute does not throw you can assume it worked.
```

### Async wrappers

The util package contains some handy dandy wrapper functions that all work the same way. Because of the nature of this service there are two functionalities that are often needed:

* Retrying: You'll want some database queries to be able to be retried a couple of times because SPARQL endpoints can be be glitchy sometimes.
* Timing: You'll want to know how long some queries take (milliseconds) and how long some long running functions take (seconds)

These are the wrapper functions in the util package.

* `longDuration`: For wrapping very long running async functions. Measures time in seconds using the javascript Date system
* `duration`: For wrapping shorter running async functions. Measures time accurately in milliseconds using the nodejs `perf_hooks` system.
* `retry`: For wrapping async functions that need to be retried a couple of times on error. When the max number of retries is exceeded the original error will be thrown with a modified message.

The util package also exports a simple `delay` function.

Imagine this is your async function:

```typescript
async function example(input:string): Promise<string> {
  await delay(10_000); // Wait 10 seconds
  return `Modified ${input}`;
}
```

If you want to time measure it:

```typescript
const measured = await duration(example)("Input string");
const durationMilliseconds = measured.durationMilliseconds; // Around 10k millis
const result = measured.result; // "Modified Input string" 
const duration = measured.durationMilliseconds; // Value is milliseconds
```

If the function is very long running:

```typescript
const measured = await longDuration(example)("Input string");
const durationSeconds = measured.durationSeconds; // Around 10
const result = measured.result; // "Modified Input string" 
const duration = measured.durationSeconds; // Value is seconds
```

If you want to retry the function 5 times and wait for a second after each failed try:

```typescript
const retried = await retry(example,5,1_000)("Input string");
const triesNeeded = retried.retries; // 0 in this case
const result = retried.result; // "Modified Input string" 
```

For the retry function you can skip the last two parameters to use the defaults from the env vars.

```typescript
const retried = await retry(example)("Input string");
```

As you can see the functions return another function which takes the same arguments as the wrapped function and return a data structure like this:


```
{
  result: <The wrapped function's output>
  information: <Extra information; such as the duration of execution or the number of retries it took to succeed>
}
```

When the wrapped function throws the returned function will throw the same error but with a little more information in the error message such as the duration of execution before erroring out of the amount of tries that were attempted. The wrappers do not support function that throw anything other than `Error` instances.

You can also nest them:

```typescript
const functionWithRetriesAndTimemesurement = duration(retry(wrappedFunction));
const output = functionWithRetriesAndTimemesurement(arg1OfWrappedFunction, Arg2OfWrappedFunction);
const result = output.result.result;
```

You can nest retries. Imagine you want to try 3 times and wait for a second after each failure. When that fails you want to wait a minute and try the whole thing again two times.

```typescript
const functionWithAlotOfRetrying = retry(retry(wrappedfunction,3,1_000),2,60_000);
```

Easy. If you pass instance methods make sure to bind them like this:

```typescript
const wrappedMethod = retry(this.method.bind(this));
```

### Job templates and jobs

ABB uses the Mu semtech higher order framework. In this framework the concept of 'jobs' exists which models an amount of work. For each job a corresponding job resource in the database exists with a status.

Eventually delta processing will be included. When a delta changes a job the service should be able to react to it.

In this microservice two kinds of jobs exist; each of which are associated with a mu-semtech compatible job resource in the jobs graph of the database connected to the report writing endpoint.

* 'Job template': A type of job that spawns jobs depending on a trigger. There are two kinds:
  * Periodic job: Triggered on a day of the week at a time of the day
  * Rest job: Triggered by a GET http request on a specific endpoint
* Job: Models the execution of a function; like generating reports.

To see a list of job templates go the the `/job-templates` page. You can trigger the rest jobs there.

A job is associated with a datamonitoring function enum value defining the function the job should execute. jobs are created in this microservice by job templates.

### Execution queue

This service can only execute jobs in series for the moment. Because of this there is a job queue. When a template job is triggered a new job is added to the queue. The queue makes sure only one job is executed at a time.

When the queue is empty a new job starts executing immediately (status BUSY). When there is already a job executing the job is added to the queue with the status 'NOT_STARTED'.

If this service is stopped while jobs are still executing that's an error. On startup the service will find all jobs with BUSY status and change the status to ERROR because they have been interrupted. On startup the service will add all jobs with the status 'NOT_STARTED' to the queue automatically so the jobs that have been queued start executing again immediately.

### Making your own job function

Make a module and export an async function of the type `JobFunction` like this (the dummy job serves as an example).

For now jobs may have arguments but there is not yet a way to define them. This may be added in the future. For now job functions are not expected to take arguments and therefore should work without them.

Lets look at the dummy function:

```typescript
// in module job/dummy.ts
export const dummyFunction: JobFunction = async (
  progress,
  numOperations: number | undefined,
  operationDurationSeconds: number | undefined
) => {
  const defaultedNumOperations = numOperations ?? 60;
  const defaultedOperationDurationSeconds = operationDurationSeconds ?? 1;
  progress.update(
    `Dummy function invoked with ${defaultedNumOperations} operations. Each operation will take ${defaultedOperationDurationSeconds} seconds. Original arguments were ${numOperations} and ${operationDurationSeconds}.`
  );

  for (let i = 0; i < defaultedNumOperations; i++) {
    await delay(defaultedOperationDurationSeconds * 1_000);
    progress.progress(
      i + 1,
      defaultedNumOperations,
      defaultedOperationDurationSeconds * 1_000
    );
  }
  progress.update(
    `Dummy function finished. Approximate duration was ${
      defaultedNumOperations * defaultedOperationDurationSeconds
    } seconds.`
  );
};
```

Implement your job function with progress as the first parameter. This object serves as a logging interface. The progress object supports the `update` and `progress` methods amongst others. The queue will call `start` and `error` for you.

`progress.update` just logs a message and sends it to listeners.
`progress.progress` sends a progress update to the listeners. This is used to update a progress bar.

You can see that apart from `progress` the dummy function takes to optional parameters. For now any JobFunction must have optional parameters only (for now).

When your new job function is ready you'll need to update two things:

1. In `job/job-functions-map.ts`:

```typescript
import { myFunction } from "./my-function.js";

export const JOB_FUNCTIONS: Record<DataMonitoringFunction, JobFunction> = {
  [DataMonitoringFunction.COUNT_RESOURCES]: generateReportsDaily,
  [DataMonitoringFunction.CHECK_HARVESTING_EXECUTION_TIME]:
    getHarvestingTimestampDaily,
  [DataMonitoringFunction.DUMMY]: dummyFunction,
  [DataMonitoringFunction.MY_FUNCTION]: myFunction,
} as const;
```

2. In `types.ts`

```typescript
export enum DataMonitoringFunction {
  COUNT_RESOURCES = `http://lblod.data.gift/vocabularies/datamonitoring/dm-function/count-resources`,
  CHECK_HARVESTING_EXECUTION_TIME = `http://lblod.data.gift/vocabularies/datamonitoring/dm-function/check-harvesting-execution-time`,
  DUMMY = `http://lblod.data.gift/vocabularies/datamonitoring/dm-function/dummy`,
  MY_FUNCTION = `http://lblod.data.gift/vocabularies/datamonitoring/dm-function/my-function`,
}
```

Then you can make a new job template referring to your new function. Possibly by using the `/create-periodic-job-template` debug endpoint or by editing the database manually.

It makes sense that you update the progress every time you perform a SPARQL query. Like this:

```typescript
const result = await duration(query.execute.bind(query))(input);
progress.progress(++queries, totalQueryCount, result.durationMilliseconds);
progress.update(
  `Performed query in ${result.durationMilliseconds} ms`
);
```

Imagine your function must execute 200 queries. It's helpful to call progress after each query including the amount of milliseconds it took the execute the query to inform the developer that the job is progressing. When you pass the milliseconds parameter the progress page will show this value in a graph.

This system may be expanded in the future.


### Monitoring job progress

Any job's progress can be monitored using the endpoint `/progress/:uuid` with uuid being the uuid of the job. You'll see a progress bar on the page and logs. When not behind a dispatcher proxy you'll see live updates.

Of course; only when debug endpoints are enabled.


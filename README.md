# Data monitoring count report generation service

This was a microservice emulating the functionality of a **future microservice** to be built. It will be called `dm-report-generation-service`. This service is to be embedded in [Data monitoring](https://github.com/lblod/app-data-monitoring) which is under development.

**The mature and new microservice to be developed will use mu-javascript template and use the validation monitoring tool's function (sourced using NPM) to validate ALL new published linked data and generate reports AS linked data.**

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

* Counting function: Proof of concept to count new published resources every day mentioned above.
* Harvested time function: Proof of concept to check the time of last harvesting
* Session document completeness check: Proof of concept to check all of the document links associated with sessions and agenda points.
* Dummy function for testing

## Stack

* Node LTS/Iron (v20.12.2)
* Typescript v5.4
* Compile to ESNEXT (ES2022 or better at time of publishing)
  * Top level await and other fun stuff
* ECMAScript modules; not CommonJS
* [Comunica](https://comunica.dev/) for SPARQL stuff. Used because of the possiblity of federed queries (noy used yet)
* [Dayjs](https://day.js.org/) for date and time stuff
* [Handlebars](https://handlebarsjs.com/guide/) for templating of queries
* [Zod](https://zod.dev/) for schema validation of any user provided input such as configuration and query parameters
* [Winston](https://www.npmjs.com/package/winston) for logging. In this way we don't end up dumping everything in `console.log` and we have some control over the output.
* Good old [Express](https://expressjs.com/) just like in mu-javascript template

## Why no mu-javascript?

This service just uses node and not mu-javascript-template because:

* When this project was started it was posed that **federated queries** would be necessary. For this the comunica library is needed and this is not included in mu-javascript template.
* This function contains many queries which can be difficult to debug. Making the same queries using javascript templates would be very difficult to maintain.
* No type safe query functions in mu-javascript-template

Because it's a PoC it's **simpler** than mu-javascript template. Hence the container size of just 67MB compared to mu-javascript-template's 456MB.

It should also be stressed that for INSERT queries a custom fetch function is used so comunica uses the same headers (`mu-auth-sudo:true`, `Content-Type: application/x-www-form-urlencoded`, `Accept: application/json`) and request structure (POST method, url endpoint in the body and the query using URL encoding) as mu-auth-sudo.

### Job templates and jobs

ABB uses the Mu semtech higher order framework. In this framework the concept of 'jobs' exists which models an amount of work. For each job a corresponding job resource in the database exists with a status.

Eventually delta processing will be included. When a delta changes a job the service should be able to react to it.

In this microservice two kinds of jobs exist; each of which are associated with a mu-semtech compatible job resource in the jobs graph of the database connected to the report writing endpoint.

* 'Job template': A type of job that spawns jobs depending on a trigger. There are two kinds:
  * Periodic job: Triggered on a day of the week at a time of the day
  * Rest job: Triggered by a GET http request on a specific endpoint
* Job: Models the execution of a function; like generating reports.

To see a list of job templates go the the `/job-templates` page. You can trigger the rest jobs there.

A job is associated with a data monitoring function enum value defining the function the job should execute. Jobs are created in this microservice by job templates.

From the perspective of other mu-semtech services both the jobs and the job templates are 'jobs' (as in `cogs:Job`). Because of this a template job has TWO classes:

```handlebars
{{toNode newJobTemplateUri}} a cogs:Job, datamonitoring:DatamonitoringTemplateJob.
{{toNode jobUri}} a cogs:Job, datamonitoring:DatamonitoringJob.
```

The service expects a `datamonitoring:DatamonitoringTemplateJob` OR a `datamonitoring:DatamonitoringJob` because there are specific attributes in them. Other mu semtech services just expect a `cogs:Job` and both are. They wont see the difference because all standard attributes are there: (`mu:uuid`,`dct:creator`,`adms:status`,`dct:created`,`dct:modified`,`task:operation`,`dct:isPartOf` (optional)). 

Because of this this service was made to be as compatible as possible with mu-semtech (programming errors aside). But because it's a PoC the delta function was not implemented yet; which brings us to the next point.

### Future adoption

This service will **need a delta endpoint** compatible with delta notifier which needs to detect changes in job status. Is a specific job's status is changed the service must act accordingly in order to make the service compatible with the [job controller service](https://github.com/lblod/job-controller-service) and the [job dashboard](https://github.com/lblod/ember-jobs-dashboard).

This delta function will need to following functionality (pseudo code).

```plaintext
LET delta = RECEIVE_DELTA()
IF IS_JOB_UPDATE(delta):
  FIND_JOB
  CHANGE_JOB_STATUS
```

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
| ORG_RESOURCES_TTL_S<br>(integer) | `300` | Value in seconds. Data concerning admin units and governing bodies are kept in a cache with a Time To Live (TTL). This prevents unnecessary load during repeated test invocations of report generation. After this time has elapsed the cache is cleared and new data needs to be queried. |
| SERVER_PORT<br>(integer) | `80` | HTTP port the server listens on. For debugging locally I suggest port 4199. |
| LOG_LEVEL<br>(string) | `"info"` | Level of the logs. Accepted values are "error","warn","info","http","verbose","debug" and "silly". For production set to "error". For development set to "info", "debug" or "silly" depending on your preference. |
| NO_TIME_FILTER<br>(boolean) | `"false"` | Set to true in some test cases. This disabled the date related filtering when counting. This can be useful when no new data was posted and too many queries yield 0. |
| DUMP_FILES_LOCATION<br>(string, directory) | `"/dump"` | Only relevant if DISABLE_DEBUG_ENDPOINT is `false`. This specifies the directory where the service will save the dump files for debugging. Typically this is a docker volume. |
| QUERY_MAX_RETRIES<br>(integer) | `3` | Amount of times the making a query is retried. |
| QUERY_WAIT_TIME_ON_FAIL_MS<br>(integer) | `1000` | Amount of time in milliseconds to wait after a query has failed before retrying. |
| ROOT_URL_PATH<br>(string, url path) | `""` | When generating absolute url paths this root path will be pasted at the beginning of the url path. Example: if ROOT_PATH is `/counting-service` then the queue debug endpoint will have the following link: `https://<domain>/counting-service/queue`. The value needs to start with a slash. And empty string is also acceptable for local testing in which case the queue endpoint is `http://localhost:<port>/queue`. |
| ADD_DUMMY_REST_JOB_TEMPLATE<br>(boolean) | `"false"` | If true a dummy rest job template will be added. This is useful to test the execution logic of this microservice. Any jobs of type 'serial' should never be executed in parallel. |
| SKIP_ENDPOINT_CHECK<br>(boolean) | `"false"` | If true the test checking if all SPARQL endpoints respond will be skipped. In production this should be 'true' because it's important to know of endpoints are up before starting operations. |
| OVERRIDE_DAY<br>(DateOnly) | `undefined` | If set then the service will generate reports for the specified day instead of yesterday. Used for debugging. Example value is `"2024-06-17"`. |


* Boolean: "true" for `true`, "false" for `false` (e.g. `DISABLE_DEBUG_ENDPOINT="true"`).
* Integer: Whole number (e.g. `QUERY_MAX_RETRIES=3`)
* DateOnly: ISO notation of a date as a string (e.g. `"2024-06-17"`) NOT EU notation. It uses dayjs under the hood.

The program will validate the environment variables before running. If you made a mistake the program will not start until you fix the error. An error could be providing a string where a number is expected or a faulty value for a boolean.

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
An object modeling a record. The key needs to be a name of a data monitoring function and the value is another object containing a time and a comma separated list of days. The service will create periodic job templates automatically when they are not present in accordance with these definitions. When they are already present the microservice will NOT change them because they are ment to be changed by updating the job records using a delta message. Delta message processing has not been developed yet. You'll need to pass values for the keys `time` and `days`. `time` requires a valid formatted time `HH:mm` (interpreted as time of the day in the local timezone). The `days` requires a string with is a comma separated list of weekdays.

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

Adapt the environment variables in the `run-container-test` file. Then run it `./run-container-test`. Make sure you have docker installed

It will build the image and then spin up a container. There will be strict type checking during building.

### Startup procedure

When the service start up it will:

1. Validate the configuration file and env vars. If not valid the service will throw and not start
2. Test all referenced SPARQL endpoints. It will retry for a number of times until a valid connection has been established. Because of this you don't need to worry if this service is online before your local virtuoso has started.
3. It loads the job templates
4. It checks if debug job templates exist if debug endpoint are true. Creates them if they are missing
5. It checks if any jobs exist with the status `BUSY`. If any are found this means the service has exited badly the last time. It will change all of these jobs statuses to ERROR.
6. It starts the CRON system
7. It starts the express server
8. Prints that the service is ready

## Debugging and triples memory store

When running the node process locally or when running the container you can use the browser to contact debug endpoints (`DISABLE_DEBUG_ENDPOINT` needs to be set to `"false"`). These functions will help you develop new code and queries faster.

To check the current catalog of functions visit: `http://localhost:4199/debug` (Port 4199 is an example. Set the port value using `SERVER_PORT`. When running on localhost the `ROOT_URL_PATH` needs to be `""`)

When `DISABLE_DEBUG_ENDPOINT` is set to `false` all of the triples created with INSERT queries will be stored in memory during runtime. It contains a link to trigger a GET request which makes a TTL triples dump of all the triples you have inserted. This is useful for testing purposes.

So to see what reports are generated: 
1. Start the service
2. Run one of the rest triggered template jobs
3. Wait for it to finish
4. In the browser surf to `http://localhost:4199/dump?filename=whateveriwant`
5. Look at the dump folder or surf to `http://localhost:4199/dump-files/whateveriwant.ttl`

Example of output of this service:

```plaintext
<http://mu.semte.ch/graphs/job> {
<http://data.lblod.info/id/0b93130a-8cc6-4d9f-b937-63044f190854> a cogs:Job, datamonitoring:DatamonitoringJob;
    mu:uuid "0b93130a-8cc6-4d9f-b937-63044f190854";
    dcterms:creator <http://data.lblod.info/id/job-creator/dm-count-report-generation-service>;
    adms:status <http://lblod.data.gift/vocabularies/datamonitoring/status/not-started>;
    dcterms:created "2024-06-18T14:53:58+02:00"^^xsd:dateTime;
    task:operation <http://lblod.data.gift/vocabularies/datamonitoring/dm-function/check-session-completeness>;
    dcterms:isPartOf <http://data.lblod.info/id/f6afdb5d-9386-4b70-9f21-2af29166750f>;
    datamonitoring:function <http://lblod.data.gift/vocabularies/datamonitoring/dm-function/check-session-completeness>;
    datamonitoring:description "Job created by dm-count-report-generation-service of job template with uri \"http://data.lblod.info/id/f6afdb5d-9386-4b70-9f21-2af29166750f\".";
    datamonitoring:jobType <http://lblod.data.gift/vocabularies/datamonitoring/task-type/serial>
}
<http://mu.semte.ch/graphs/public> {
<http://data.lblod.info/id/405aab33-161c-419d-839f-149cc7909c21> a datamonitoring:GoverningBodyDocumentPresenceCheckReport;
    mu:uuid "405aab33-161c-419d-839f-149cc7909c21";
    datamonitoring:createdAt "2024-06-18T14:54:00+02:00"^^xsd:dateTime;
    datamonitoring:day "2024-06-17"^^xsd:date;
    datamonitoring:targetAdministrativeUnit <http://data.lblod.info/id/bestuurseenheden/c73ee91f068da28ed1f16fb057f38808e7c0d29f4c5b8b9d7b2eec235ed4d5a4>;
    datamonitoring:targetGoverningBody <http://data.lblod.info/id/bestuursorganen/2c78c016a05e4b80ad5a5fb5513b277ca1899c8444d5f04112b9110701911969>;
    skos:prefLabel "Document presence check of all new sessions associated with the governing body \"Adjunct-algemeen directeur\" of admin unit \"Brecht\".";
    datamonitoring:istest true;
    datamonitoring:totalSessions 0.
}
```

## Developing this service further and background

### The templated query system

If you wish to change the queries and/or add query invocations you'll need to know how the templated query system works.

In order to write a new query add one in `job-functions/my-function/queries.ts` assuming your function is named `my-function`.

First write a query using [handlebars](https://handlebarsjs.com/) like this:

```typescript
import { compileSparql } from "../../handlebars/index.js";

export const mySelectQueryTemplate = compileSparql(`\
{{prefixes}}

SELECT ?resourceUri ?label WHERE {
  ?resourceUri a {{toNode classUri}};
    skos:prefLabel ?label;
    example:day {{toDate day}};
    example:time ?time;
    example:fixedTextObjectExamplePredicate {{escape stringValueWithQuotes}}.
}
`);
```

And add an input and an output type:

The input is what will be passed to the handlebars templating system. In this case:

```typescript
export type MySelectQueryInput = {
  prefixes: string;
  classUri: string;
  day: DateOnly;
  stringValueWithQuotes: string; // Quotes are no problem because the toString helper will escape them.
}
```
The output is linked to the selected variables after the `SELECT` keyword. In this case.

```typescript
export type MySelectQueryOutput = {
  resourceUri: string;
  label: string;
  timeOfDay: TimeOnly;
}
```

Please note that in the query templates quotation marks for literals should NEVER be used! The helpers will render them for you and you should always use the helpers. The `compileSparql` is intended specifically to compile handlebars intended for SPARQL queries. Another one is available to render HTML called `compileHtml` but the associated runtime does not provide SPARQL specific helpers.

Include ANY variable referenced in the template in the input type. In ALL cases you will need a literal helper function which converts the variable to a string which is a valid RDF literal (shaped like `"serialnotation"^^"xsd:Type"`) OR a valid URI notation (shaped like `<http://valid-uri.com#resource>`). Whenever you expect the user of your query to input an URI make sure to use `uri` in the name of the variable and use the `toNode` helper to render it. In the future we may use RDFJS integration but now it's pure text wrangling. In order to maximize robustness you should NEVER include a SPARQL literal value directly but always use a helper when inserting a value of a javascript variable. The `toString` helper might seem stupid because you could just do `"{{theStringVar}}"` but this is not the case. The `toString` helper makes sure that illegal characters are properly escaped.

These are all the helpers for SPARQL queries that print literal values.

| Variabele type | Helper | Type Notation in typescript | Handlebars notation |
| :--- | :--- | :--- | :--- |
| `DateOnly` | `toDate` | `exampleDate:DateOnly;` | `{{toDate exampleDate}}` |
| `TimeOnly` | `toTime` | `exampleTime:TimeOnly;` | `{{toTime exampleTime}}` |
| `DateTime` | `toDateTime` | `exampleDateTime:DayJs;` | `{{toDateTime exampleDateTime}}` |
| `number` | `toInteger` | `int:number;` | `{{toInteger int}}` |
| `number` | `toFloat` | `float:number;` | `{{toFloat float}}` |
| `boolean` | `toBoolean` | `yesNo:boolean;` | `{{toBoolean yesNo}}` |
| `string` | `toString` | `message:string;` | `{{toString message}}` |
| `JobStatus` | `toJobStatus` | `exampleStatus:JobStatus;` | `{{toJobStatus exampleStatus}}` |

The last row in the table is an enum value. Other enums such as `JobType`, `JobStatus`, `JobTemplateType`, `JobTemplateStatus`, `DayOfWeek` and `DatamonitoringFunction` are also supported in a similar way.

Additional remarks:
* Because javascript numbers are 64 bit floating point numbers all float literals get the `xsd:double` datatype when using the `toFloat`. `NaN`, `Number.POSITIVE_INFINITY` and `-Number.POSITIVE_INFINITY` are valid values. If you want to throw on `NaN` you'll need to do your own check.
* The `toInteger` helper will throw an error if the number is not a safe integer. It will not round automatically to the nearest integer.
* Use the `toNode` helper to print URI's in the query. It will check if the URI is valid and add the `<` and `>` for you. (e.g. `{{toNode abstractGoverningBodyUri}}`).

It's important to add **two typescript types together with a SELECT query and export them**: one for the input and one for the output. For INSERT queries you will only need an input type.

In this type structure you can also use TimeOnly, DateOnly, DateTime(Dayjs, modeling a timestamp) and enums. When parsing the bindings after invoking the `objects` or `records` method of the `TemplatedSelect` instance will automatically convert the variables to the correct type because the linked data has type information. Of course you can just use strings and number without helpers. Remember that Handlebars is 'dumb'. Whatever template you write will need to generate correct SPARQL. So putting URI's in your query will require you to use the `toNode` helper which renders the `<` and `>` characters and performs a sanity check.

Then, in another file where you want to execute the query (e.g. `job-functions/my-function/index.ts`), you'll instantiate the `TemplatedSelect` class to perform a select query.

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

These are the wrapper functions in the util module.

* `longDuration`: For wrapping very long running async functions. Measures time in seconds using the javascript Date system
* `duration`: For wrapping shorter running async functions. Measures time accurately in milliseconds using the NodeJS `perf_hooks` system.
* `retry`: For wrapping async functions that need to be retried a couple of times on error. When the max number of retries is exceeded the original error will be thrown with a modified message.

The util module also exports a simple `delay` function.

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

### Folder structure and adding your own data monitoring function

When you want to create a new template job:

1. Edit `types.ts` and add your job to the `DataMonitoringFunction` enum. The enum values are URI's of a concept.
2. In the `job-functions` folder add a new folder (e.g. `my-new-function`). In that folder make two new files: `index.ts` and `queries.ts`
   1. In `index.ts` write an async function of type `JobFunction` and export it (see below)
   2. In `queries.ts` write your handlebars SPARQL queries associated with your job. For convenience keep the input and output types and the query together.
3. Edit the `JOB_FUNCTIONS` constant in `job/job-functions-map.ts` to add a function reference to the DataMonitoringFunction enum value.
4. In `index.ts` add some code to create a rest triggered templated job for your new job function if you require one.

Notes:

A job function looks like this:

```typescript
export const myFunction: JobFunction = async (progress) {
  // A great many important statements.
  progress.update(`A log message`);
  progress.progress(completedOperations, totalOperations, optionalDuration); // Update progress bar
}
```

If you want to make a debug function for your new job you'll need to add this in `index.ts`:

```typescript
await createRestJobTemplate(
  DataMonitoringFunction.MY_FUNCTION,
  "my-function",
  JobTemplateStatus.ACTIVE
);
```
Then you can run it (if debug mode is ON) by surfing to `http://localhost:4199/start/my-function`.

Imagine your function must execute 200 queries. It's helpful to call progress after each query including the amount of milliseconds it took the execute the query to inform the developer that the job is progressing. When you pass the milliseconds parameter the progress page will show this value in a graph.

Implement any job function with progress as the first parameter. This object serves as a logging interface. The progress object supports the `update` and `progress` methods amongst others. The queue will call `start` and `error` for you.

`progress.update` just logs a message and sends it to listeners.
`progress.progress` sends a progress update to the listeners. This is used to update a progress bar.

You can see that apart from `progress` the dummy job function takes to optional parameters. For now any JobFunction must have optional parameters only (for now).

It makes sense that you update the progress every time you perform a SPARQL query. Like this:

```typescript
const result = await duration(query.execute.bind(query))(input);
progress.progress(++queries, totalQueryCount, result.durationMilliseconds);
progress.update(
  `Performed query in ${result.durationMilliseconds} ms`
);
```

### Adding your own debug endpoint

Imagine you write an async function and you want to be able to call it using a HTTP GET call. Just edit `debug/endpoints.ts` and add something like this:

```typescript
addSimpleDebugEndpoint(
  app,
  "GET",
  "/my-endpoint",
  emptySchema,
  myAsyncFunction
);
```

`emptySchema` means this function does not take query parameters. If you want query parameters you'll need to make a zod schema.

Look at the store dump function for an example of a debug function using a schema:

```typescript
const storeDumpQuerySchema = z
  .object({
    filename: z
      .string()
      .regex(/[\w\d-]+/)
      .optional(),
  })
  .strict();

async function storeDump(query: z.infer<typeof storeDumpQuerySchema>) {
  const defaultedFilenameWithoutExtention =
    query.filename ?? "dump-" + now().format("YYYYMMDDHHmm");
  dumpStore(
    `${config.env.DUMP_FILES_LOCATION}/${defaultedFilenameWithoutExtention}.ttl`
  );
}

addSimpleDebugEndpoint(app, "GET", "/dump", storeDumpQuerySchema, storeDump);
```

You can do something similar for your functions. The `addSimpleDebugEndpoint` inserts express middleware to help visualize the results.

### Execution queue

This service can only execute jobs in series for the moment. Because of this there is a job queue. When a template job is triggered a new job is added to the queue. The queue makes sure only one job is executed at a time.

When the queue is empty a new job starts executing immediately (status BUSY). When there is already a job executing the job is added to the queue with the status 'NOT_STARTED'.

If this service is stopped while jobs are still executing that's an error. On startup the service will find all jobs with BUSY status and change the status to ERROR because they have been interrupted. On startup the service will add all jobs with the status 'NOT_STARTED' to the queue automatically so the jobs that have been queued start executing again immediately.

Check the jobs in the queue by surfing to `http://localhost:4199/queue` when testing locally and with debug endpoint enabled.


### Monitoring job progress

Any job's progress can be monitored using the endpoint `http://localhost:4199/progress/:uuid` with uuid being the uuid of the job. You'll see a progress bar on the page and logs. When not behind a dispatcher proxy you'll see live updates.

Of course; only when debug endpoints are enabled.


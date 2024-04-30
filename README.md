# Data monitoring count report generation service

This is a microservice emulating the functionality of a future microservice to be built. It will be called `dm-report-generation-service`. This service is to be embedded in [Data monitoring](https://github.com/lblod/app-data-monitoring) which is under development.

The point of this microservice is to contain functionality that contacts a specific SPARQL endpoint using SPARQL queries. A function needs to run automatically every night which executes queries to gather information about specific resources. In this particular case the microservice will just count the amount of new records each day for each governing body (bestuursorgaan) of each admin unit (bestuurseenheid). Reports are written to a different SPARQL endpoint

The nightly procedure looks as follows in pseudocode:

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

## Configuration

### Environment variables

| Variable name & type | Default value | Explanation |
| :--- | :--- | :--- |
| ADMIN_UNIT_ENDPOINT(string, URL) | No default. Required. | URL of the SPARQL endpoint where the reporting service can query for admin units and governing bodies. Typically ending in `/sparql` |
| REPORT_ENDPOINT(string, URL) | No default. Required | Url of the SPARQL endpoint where the reporting service can write reports to  |
| DISABLE_DEBUG_ENDPOINT(boolean) | `"true"` | True activates endpoints which can be used for testing. See discussion below. In production these endpoint should be disabled. |
| REPORT_GRAPH_URI(string, URI) | `"http://mu.semte.ch/graphs/public"` | The URI of the graph where to write report related linked data to. |
| CONFIG_FILE_LOCATION(string, directory) | `"/config"` | The directory where the config file can be found. Useful for development. Default value is the location in the container. |
| SLEEP_BETWEEN_QUERIES_MS(integer) | `0` | Value in milliseconds. Setting this higher than 0 means the service will wait the specified number of milliseconds after each query before the next query. This may be needed in order to prevent the service from overloading the database. |
| SHOW_SPARQL_QUERIES(boolean) | `"false"` | Set to true to print the queries to the console (`info` log level) |
| LIMIT_NUMBER_ADMIN_UNITS(integer) | `0` | 0 Means query for all admin units. A non zero value imposes a limit. This is useful for testing so you don't flood the database. I'd suggest you set it to 5 for testing. |
| ORG_RESOURCES_TTL_S(number) | `300` | Value in seconds. Data concerning admin units and governing bodies are kept in a cache with a Time To Live (TTL). This prevents unnecessary load during repeated test invocations of report generation. After this time has elapsed the cache is cleared and new data needs to be queried.
| SERVER_PORT(number) | `80` | HTTP port the server listens on. |
| REPORT_CRON_EXPRESSION(string, cron expression) | `"0 0 * * *"` | The cron expression which invokes the report generation script. Default is every day at 00:00. |
| LOG_LEVEL(string) | `"info"` | Level of the logs. Accepted values are "error","warn","info","http","verbose","debug" and "silly". For production set to "error". For development set to "info" or "debug". |
| NO_TIME_FILTER(boolean) | `"false"` | Set to true for testing. This disabled the date related filtering when counting. This can be useful when no new data was posted and too many queries yield 0. |

* Boolean: "true" for `true`, "false" for `false`.

The program will validate the environment variables before running. If you made a mistake the program will stop until you fix the error. An error could be providing a string where a number is expected or a faulty value for a boolean.

### File

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
    }
  ],
  ...
}
```

It's a list of endpoints specifying a SPARQL endpoint URL and a list of resources to count. There is a JSON schema so you should not make any mistaktes. If you do mess up the schema though the program will crash on startup and you'll get a slap on the wrist.

## Testing

### Running locally

You'll need node v20.12.2 or higher. I suggest using [NVM](https://github.com/nvm-sh/nvm). If you do use NVM you can run:

1. `nvm install lts/iron`
2. `nvm use lts/iron`

To run locally:

1. Clone the repo
2. Run `npm install` in the folder
3. Change the file `env-dev` to your preferences.
4. Run `npm run dev` and nodemon will start. It will run the service using TSX

VSCode users can use the debugger. Again make sure `env-dev` is adapted to your circumstance and press play in the debugger sidebar.

### Running from a container

Adapt the environment variables in the `run` file. Then run it `./run`.

It will build the image and then spin up a container. There will be strict type checking.

### 

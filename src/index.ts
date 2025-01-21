import cors, { CorsOptions } from "cors";
import express, { Express } from "express";
import { config } from "./configuration.js";
import { TemplatedSelect } from "./queries/templated-query.js";
import { queryEngine } from "./queries/query-engine.js";
import {
  TestQueryInput,
  TestQueryOutput,
  testQueryTemplate,
} from "./queries/util-queries.js";
import {
  createPeriodicJobTemplate,
  createRestJobTemplate,
  deleteAllJobTemplates,
  getJobTemplates,
  loadJobTemplates,
  setJobTemplateCreeationDefaults,
} from "./job/job-template.js";
import { getJobs, setJobCreationDefaults } from "./job/job.js";
import {
  DataMonitoringFunction,
  JobStatus,
  JobTemplateStatus,
  JobTemplateType,
  getEnumStringFromUri,
} from "./types.js";
import { setupDebugEndpoints } from "./debug-endpoints/endpoints.js";
import { logger } from "./logger.js";
import { initCron } from "./cron/cron.js";

async function startupProcedure() {
  logger.info(
    "CHECK PASSED: Configuration is validated successfully. Both config file and env variables. Checking endpoints..."
  );
  if (!config.env.SKIP_ENDPOINT_CHECK) {
    // Check all endpoints
    const endpoints = new Set([
      config.env.ADMIN_UNIT_ENDPOINT,
      config.env.REPORT_ENDPOINT,
      ...config.file.endpoints.map((value) => value.url),
    ]);
    logger.verbose(
      `Testing SPARQL endpoints (${[...endpoints].join(
        ","
      )}) to see if they are up. Will retry 10 times and wait for 30 seconds after each try for each endpoint.`
    );
    for (const endpoint of endpoints) {
      const testQuery = new TemplatedSelect<TestQueryInput, TestQueryOutput>(
        queryEngine,
        endpoint,
        testQueryTemplate
      );
      try {
        // Try lots of times because the database might not be up yet
        const result = await testQuery.result({}, 10, 30_000);
        if (result.result !== 2)
          throw new Error(
            `The endpoint "${endpoint}" does not know that 1+1=2. Might want to look into that.`
          );
        logger.verbose(`\tEndpoint ${endpoint} passed.`);
      } catch (e) {
        logger.error(
          `The service cannot start because query failed on endpoint "${endpoint}" a  after 10 retries and a total wait time of 5 minutes.`
        );
        throw e; // Re throw. Node process is killed.
      }
    }
    logger.info("CHECK PASSED: All endpoints can be queried.");
  } else {
    logger.warn("ENDPOINT CHECK SKIPPED. Due to env var setting.");
  }
  // initialise stuff
  // Job templates
  setJobTemplateCreeationDefaults(queryEngine, config.env.REPORT_ENDPOINT); // Always needs to be called. Created in case we 'd want to use a different query engine for jobs in the future.
  await loadJobTemplates();
  logger.info(
    `CHECK PASSED: Job templates loaded. ${getJobTemplates().length} found.`
  );
  // For all invocation times provided in the config file; check if a periodic job is present and create one if necassary
  for (const [func, invocationInfo] of Object.entries(
    config.file.periodicFunctionInvocationTimes
  )) {
    const job = getJobTemplates().find(
      (j) =>
        j.jobTemplateType === JobTemplateType.PERIODIC &&
        j.datamonitoringFunction === (func as DataMonitoringFunction)
    );
    if (job) {
      logger.warn(
        `Job for function ${getEnumStringFromUri(
          func,
          false
        )} already exists. Config file ignored. Update the jobs using delta's (not implemented yet).`
      );
    } else {
      logger.info(
        `Job for function ${getEnumStringFromUri(
          func,
          false
        )} does not exist yet. Config file is used to create the job.`
      );
      await createPeriodicJobTemplate(
        func as DataMonitoringFunction,
        invocationInfo.time,
        invocationInfo.days,
        JobTemplateStatus.ACTIVE
      );
    }
  }
  if (!config.env.DISABLE_DEBUG_ENDPOINT) {
    // If debug mode is activated this microservicie is supposed to have a jobTemplate for debugging each function
    const restInvokedJobs = getJobTemplates().filter(
      (job) => job.jobTemplateType === JobTemplateType.REST_INVOKED
    );
    const desiredAmountOfRestJobs =
      3 + (config.env.ADD_DUMMY_REST_JOB_TEMPLATE ? 1 : 0);
    const recreate = await (async () => {
      switch (restInvokedJobs.length) {
        case 0:
          logger.info(`Debug jobs do not exist. Creating them.`);
          return true;
        case desiredAmountOfRestJobs:
          logger.info(
            `Debug jobs exist in the database (${restInvokedJobs.length}). OK.`
          );
          return false;
        default:
          logger.warn(
            `Inssuficient rest jobs found (${restInvokedJobs.length}) and that is very strange. There should be two. Deleting all rest jobs and recreating them`
          );
          await deleteAllJobTemplates([JobTemplateType.REST_INVOKED]);
          return true;
      }
    })();
    if (recreate) {
      await createRestJobTemplate(
        DataMonitoringFunction.COUNT_RESOURCES,
        "start-count-report",
        JobTemplateStatus.ACTIVE
      );
      await createRestJobTemplate(
        DataMonitoringFunction.CHECK_HARVESTING_EXECUTION_TIME,
        "start-harvesting-exec-time-report",
        JobTemplateStatus.ACTIVE
      );
      await createRestJobTemplate(
        DataMonitoringFunction.CHECK_SESSION_COMPLETENESS,
        "check-session-completeness",
        JobTemplateStatus.ACTIVE
      );
      await createRestJobTemplate(
        DataMonitoringFunction.CHECK_MATURITY_LEVEL,
        "check-maturity-level",
        JobTemplateStatus.ACTIVE
      );
      await createRestJobTemplate(
        DataMonitoringFunction.CHECK_SESSION_TIMESTAMPS,
        "check-session-timestamps",
        JobTemplateStatus.ACTIVE
      );
    }
    // Create a dummy job if env requests it and it does not exist yet
    const debugJobExists = getJobTemplates().find(
      (jt) => jt.datamonitoringFunction === DataMonitoringFunction.DUMMY
    );
    if (config.env.ADD_DUMMY_REST_JOB_TEMPLATE) {
      if (debugJobExists) {
        logger.info(
          `Specific dummy debug job was required by env vars and exists already. No operation.`
        );
      } else {
        logger.info(
          `Specific dummy debug job was required by env vars and does not exist. Creating it.`
        );
        await createRestJobTemplate(
          DataMonitoringFunction.DUMMY,
          "dummy-job",
          JobTemplateStatus.ACTIVE
        );
      }
    } else {
      logger.verbose(`No debug job required by env-vars.`);
    }
  }
  // Jobs
  setJobCreationDefaults(queryEngine, config.env.REPORT_ENDPOINT);
  // await loadJobs();
  logger.info("Jobs loaded");
  initCron();
  logger.info("CRON runtime started");
}

async function shutDownProcedure() {
  // Stop all tasks who are busy and warn
  // Change job status
  const executing = getJobs().filter((j) => j.status === JobStatus.BUSY);
  if (executing.length)
    logger.warn(
      `${executing.length} Jobs were executing when shutdown signal was received. Their status will change to ERROR because their process was interrupted and the state was lost.`
    );
}

function setupExpress(): express.Express {
  const corsOptions: CorsOptions = {
    origin: ["http://localhost:4199"],
    methods: ["GET"],
    optionsSuccessStatus: 200,
  };
  const app: Express = express();
  app.use(cors(corsOptions));

  // Health endpoints
  app.get("/ping", async (_, res) => {
    res.send({ pong: "true" });
  });
  app.get("/status", async (_, res) => {
    res.send({ running: "true" });
  });

  if (!config.env.DISABLE_DEBUG_ENDPOINT) {
    setupDebugEndpoints(app);
  }

  return app;
}

// Top level await is allowed in this version of javascript
await startupProcedure();
logger.info("Startup procedure complete");
const app = setupExpress();
logger.info("Express server setup procedure complete");
// Start server
app.listen(config.env.SERVER_PORT, () => {
  logger.info(
    `Report generation microservice started and listening on http://localhost:${config.env.SERVER_PORT}/debug.`
  );
});

// Catch CTRL+C and docker kill signal
process.on("SIGINT", () => {
  logger.warn("SIGIT received. Shutting down gracefully.");
  shutDownProcedure()
    .then(() => {
      logger.info("Shutdown gracefully. Stopping");
      process.exit(0);
    })
    .catch((e) => {
      logger.error("Unable to shutdown gracefully somehow.");
      if (e instanceof Error) {
        logger.error(e.message);
      }
      process.exit(1);
    });
});

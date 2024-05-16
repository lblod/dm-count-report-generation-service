import cors, { CorsOptions } from "cors";
import express, { Express } from "express";
import { config } from "./configuration.js";
import { TemplatedSelect } from "./queries/templated-query.js";
import { queryEngine } from "./queries/query-engine.js";
import {
  TestQueryInput,
  TestQueryOutput,
  testQueryTemplate,
} from "./queries/queries.js";
import {
  createPeriodicJob,
  createRestJob,
  deleteAllJobs,
  getJobs,
  loadJobs,
  setJobCreeationDefaults,
} from "./job/job.js";
import { deleteBusyTasks, setTaskCreationDefaults } from "./job/task.js";
import {
  DataMonitoringFunction,
  JobStatus,
  JobType,
  getEnumStringFromUri,
} from "./types.js";
import { setupDebugEndpoints } from "./debug-endpoints/endpoints.js";
import { logger } from "./logger.js";
import { initCron } from "./cron/cron.js";

async function startupProcedure() {
  logger.info(
    "CHECK PASSED: Configuration is validated successfully. Both config file and env variables."
  );
  // Check all endpoints
  const endpoints = new Set([
    config.env.ADMIN_UNIT_ENDPOINT,
    config.env.REPORT_ENDPOINT,
    ...config.file.endpoints.map((value) => value.url),
  ]);
  for (const endpoint of endpoints) {
    const testQuery = new TemplatedSelect<TestQueryInput, TestQueryOutput>(
      queryEngine,
      endpoint,
      testQueryTemplate
    );
    try {
      // Try lots of times because the database might not be up yet
      const result = await testQuery.result({}, 10, 1000);
      if (result.result !== 2)
        throw new Error(
          `The endpoint "${endpoint}" does not know that 1+1=2. Might want to look into that.`
        );
    } catch (e) {
      logger.error(
        `The service cannot start because query failed on endpoint "${endpoint}"`
      );
      throw e; // Re throw. Node process is killed.
    }
  }
  logger.info("CHECK PASSED: All endpoints can be queried.");
  // initialise stuff
  // Jobs
  setJobCreeationDefaults(queryEngine, config.env.REPORT_ENDPOINT);
  await loadJobs();
  logger.info(`CHECK PASSED: Jobs loaded. ${getJobs().length} found.`);
  // For all invocation times provided in the config file; check if a periodic job is present and create one if necassary
  for (const [func, invocationInfo] of Object.entries(
    config.file.periodicFunctionInvocationTimes
  )) {
    const job = getJobs().find(
      (j) =>
        j.jobType === JobType.PERIODIC &&
        j.datamonitoringFunction === (func as DataMonitoringFunction)
    );
    if (job) {
      logger.warn(
        `Job for function ${getEnumStringFromUri(
          func,
          false
        )} already exists. Config file ignored.`
      );
    } else {
      logger.info(
        `Job for function ${getEnumStringFromUri(
          func,
          false
        )} does not exist yet. Config file is read.`
      );
      await createPeriodicJob(
        func as DataMonitoringFunction,
        invocationInfo.time,
        invocationInfo.days,
        JobStatus.ACTIVE
      );
    }
  }
  if (!config.env.DISABLE_DEBUG_ENDPOINT) {
    // If debug mode is activated this microservicie is supposed to have a job for debugging
    const restInvokedJobs = getJobs().filter(
      (job) => job.jobType === JobType.REST_INVOKED
    );
    const recreate = await (async () => {
      switch (restInvokedJobs.length) {
        case 0:
          logger.info(`Debug jobs do not exist. Creating them.`);
          return true;
        case 1:
          logger.warn(
            `Only one rest job was found and that is very strange. There should be two. Deleting all rest jobs and recreating them`
          );
          await deleteAllJobs([JobType.REST_INVOKED]);
          return true;
        default:
          logger.info(`Debug jobs exist in the database. OK.`);
          return false;
      }
    })();
    if (recreate) {
      await createRestJob(
        DataMonitoringFunction.COUNT_RESOURCES,
        "start-count-report",
        JobStatus.ACTIVE
      );
      await createRestJob(
        DataMonitoringFunction.CHECK_HARVESTING_EXECUTION_TIME,
        "start-harvesting-exec-time-report",
        JobStatus.ACTIVE
      );
    }
  }
  // Tasks
  setTaskCreationDefaults(queryEngine, config.env.REPORT_ENDPOINT);
  await deleteBusyTasks();
  logger.info("Made sure there are no busy tasks");
  initCron();
  // await loadTasks();
  // logger.info(`CHECK PASSED: Tasks loaded. ${getTasks().length} found.`);
  // If any of the tasks loaded is still busy this means that the service was not properly closed last time.
  // Any tasks with status active will be deleted and a warning will be printed
  // for (const task of getTasks()) {
  //   if (task.status === TaskStatus.BUSY) {
  //     logger.warn(
  //       `Ecountered task with URI "${task.uri}" with status BUSY when the service is starting. Because tasks can only be BUSY when the service is running this indicates that the service did not shut down properly before. It will be deleted.`
  //     );
  //     await deleteTask(task);
  //   }
  // }
}

async function shutDownProcedure() {
  // Stop all tasks who are busy and warn
  // Change job status
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
    `Report generation microservice started and listening on ${config.env.SERVER_PORT}.`
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

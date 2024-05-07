import cors, { CorsOptions } from "cors";
import express, { Express } from "express";
import { config } from "./configuration.js";
import { TemplatedSelect } from "queries/templated-query.js";
import { queryEngine } from "queries/query-engine.js";
import {
  TestQueryInput,
  TestQueryOutput,
  testQueryTemplate,
} from "queries/queries.js";
import {
  createPeriodicJob,
  createRestJob,
  getJobs,
  loadJobs,
  setDebugJob,
  setJobCreeationDefaults,
} from "job/job.js";
import { deleteBusyTasks, setTaskCreationDefaults } from "job/task.js";
import {
  DataMonitoringFunction,
  DayOfWeek,
  JobStatus,
  JobType,
} from "types.js";
import { setupDebugEndpoints } from "debug-endpoints/endpoints.js";
import { logger } from "logger.js";

async function startupProcedure() {
  // Check all endpoints
  const endpoints = new Set([
    config.env.ADMIN_UNIT_ENDPOINT,
    config.env.REPORT_ENDPOINT,
    ...config.file.map((value) => value.url),
  ]);
  for (const endpoint of endpoints) {
    const testQuery = new TemplatedSelect<TestQueryInput, TestQueryOutput>(
      queryEngine,
      endpoint,
      testQueryTemplate
    );
    try {
      const result = await testQuery.result({});
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
  // This microservice is supposed to have at least one periodic job creating reports. If it does not exist create one
  if (
    !getJobs().some(
      (job) =>
        job.jobType === JobType.PERIODIC &&
        job.datamonitoringFunction === DataMonitoringFunction.GENERATE_REPORTS
    )
  ) {
    logger.info(
      `Job creating reports does not exist. Creating one using the environment variables\nAt ${config.env.REPORT_INVOCATION_TIME.toString()} on ${config.env.REPORT_INVOCATION_DAYS.map(
        (day) => Object.entries(DayOfWeek).find((entry) => entry[1] === day)![0]
      )}`
    );
    await createPeriodicJob(
      DataMonitoringFunction.GENERATE_REPORTS,
      config.env.REPORT_INVOCATION_TIME,
      config.env.REPORT_INVOCATION_DAYS,
      JobStatus.ACTIVE // Activate right away
    );
  } else {
    logger.info(
      `One ore more jobs already exist in the database to generate reports. Using these jobs. Environment variables REPORT_INVOCATION_TIME and REPORT_INVOCATION_DAYS ignored.`
    );
  }
  if (!config.env.DISABLE_DEBUG_ENDPOINT) {
    // If debug mode is activated this microservicie is supposed to have a job for debugging
    const restInvokedJobs = getJobs().filter(
      (job) =>
        job.jobType === JobType.REST_INVOKED &&
        job.datamonitoringFunction === DataMonitoringFunction.GENERATE_REPORTS
    );
    if (restInvokedJobs.length === 0) {
      logger.info(`Debug job does not exist. Creating one.`);
      setDebugJob(
        await createRestJob(
          DataMonitoringFunction.GENERATE_REPORTS,
          "start-report-generation",
          JobStatus.ACTIVE
        )
      );
    } else {
      if (restInvokedJobs.length === 1) {
        setDebugJob(restInvokedJobs[0]);
        logger.info(`REST invoked job found. Setting it as the debug job`);
      } else {
        setDebugJob(restInvokedJobs[0]);
        logger.warn(
          `More then one rest invoked job found. Setting the first one as the debug job. URI's of the jobs found are: \n${restInvokedJobs.map(
            (job) => "\n\t" + job.uri + ","
          )}`
        );
      }
    }
  }
  // Tasks
  setTaskCreationDefaults(queryEngine, config.env.REPORT_ENDPOINT);
  await deleteBusyTasks();
  logger.info("Made sure there are no busy tasks");
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

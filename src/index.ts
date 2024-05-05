import cors, { CorsOptions } from "cors";
import express, { Express } from "express";
import { generateReports } from "./report-generation.js";
import { DateOnly, VALID_ISO_DATE_REGEX } from "./date-util.js";
import logger from "./logger.js";
import { config } from "./configuration.js";
import {
  addDebugEndpoint,
  addExperimentalDebugEndpoint,
} from "debug-endpoints/debug-functions.js";
import { z } from "zod";
import dayjs from "dayjs";
import fs from "node:fs";
import Handlebars from "handlebars";
import { addSSE } from "sse.js";
import { TemplatedSelect } from "queries/templated-query.js";
import { queryEngine } from "queries/query-engine.js";
import {
  TestQueryInput,
  TestQueryOutput,
  testQueryTemplate,
} from "queries/queries.js";
import {
  createPeriodicJob,
  getJobs,
  loadJobs,
  setJobCreeationDefaults,
} from "job/job.js";
import {
  deleteTask,
  getTasks,
  loadTasks,
  setTaskCreationDefaults,
} from "job/task.js";
import {
  DataMonitoringFunction,
  JobStatus,
  JobType,
  TaskStatus,
} from "types.js";
import { clearStore, dumpStore } from "queries/store.js";
import { setupDebugEndpoints } from "debug-endpoints/endpoints.js";

// TODO make this sensible
const corsOptions: CorsOptions = {
  origin: ["http://localhost:4199"],
  methods: ["GET"],
  optionsSuccessStatus: 200,
};

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
  // This microservice is supposed to have one periodic job creating reports. If it does not exist create one
  if (
    !getJobs().some(
      (job) =>
        job.jobType === JobType.PERIODIC &&
        job.datamonitoringFunction === DataMonitoringFunction.GENERATE_REPORTS
    )
  ) {
    await createPeriodicJob(
      DataMonitoringFunction.GENERATE_REPORTS,
      config.env.REPORT_INVOCATION_TIME,
      config.env.REPORT_INVOCATION_DAYS,
      JobStatus.ACTIVE // Activate right away
    );
    logger.info(
      `Job creating reports does not exist. Creating one using the environment variables\nAt ${
        config.env.REPORT_INVOCATION_TIME.toString
      } on ${config.env.REPORT_INVOCATION_DAYS.join(",")}`
    );
  } else {
    logger.info(
      `One ore more jobs already exist in the database to generate reports. Using these jobs. Environment variables REPORT_INVOCATION_TIME and REPORT_INVOCATION_DAYS ignored.`
    );
  }
  // Tasks
  setTaskCreationDefaults(queryEngine, config.env.REPORT_ENDPOINT);
  await loadTasks();
  // If any of the tasks loaded is still busy this means that the service was not properly closed last time.
  // Any tasks with status active will be deleted and a warning will be printed
  for (const task of getTasks()) {
    if (task.status === TaskStatus.BUSY) {
      logger.warn(
        `Ecountered task with URI "${task.uri}" with status BUSY when the service is starting. Because tasks can only be BUSY when the service is running this indicates that the service did not shut down properly before. It will be deleted.`
      );
      await deleteTask(task);
    }
  }
}

async function shutDownProcedure() {
  // Stop all tasks
  // Destroy specific tasks
}

function setupExpress(): express.Express {
  const app: Express = express();
  app.use(cors(corsOptions));
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
// TODO shutdown procedure
process.on("SIGINT", () => {
  logger.info("SIGIT received. Stopping.");
  process.exit(0);
});

import {
  config,
  datamonitoringFunctionSchema,
  invocationDaysSchema,
  invocationTimeSchema,
} from "../configuration.js";
import express, { Express, Request, Response } from "express";
import fs from "node:fs";
import { clearStore, dumpStore } from "../queries/store.js";
import { z } from "zod";
import { addDebugEndpoint, addSimpleDebugEndpoint } from "./middleware.js";
import {
  RestJobTemplate,
  createPeriodicJobTemplate,
  deleteAllJobTemplates,
  getJobTemplate,
  getJobTemplates,
} from "../job/job-template.js";
import { showJobTemplates, showProgress, showQueue } from "./functions.js";
import { deleteJobs, getJobs } from "../job/job.js";
import { logger } from "../logger.js";
import { now } from "../util/date-time.js";
import { JobStatus } from "../types.js";
import { ALL_DAYS_OF_WEEK } from "../local-constants.js";
import { compileHtml } from "../handlebars/index.js";

const debugIndexHtml = compileHtml(
  fs.readFileSync("./templates/debug.hbs", {
    encoding: "utf-8",
  })
)({});

const staticIndexTemplate = compileHtml(
  fs.readFileSync("./templates/static-index.hbs", { encoding: "utf-8" })
);

const storeDumpQuerySchema = z
  .object({
    filename: z
      .string()
      .regex(/[\w\d-]+/)
      .optional(),
  })
  .strict();

const emptySchema = z.union([z.undefined(), z.object({})]);

/**
 * Dump the contents of the triple memory store to a TTL file for debugging
 * @param query The query schema for the store dump function
 */
async function storeDump(query: z.infer<typeof storeDumpQuerySchema>) {
  const defaultedFilenameWithoutExtention =
    query.filename ?? "dump-" + now().format("YYYYMMDDHHmm");
  dumpStore(
    `${config.env.DUMP_FILES_LOCATION}/${defaultedFilenameWithoutExtention}.ttl`
  );
}

/**
 * Main function of this module. If debug env var is true then all of the debug endpoints are added to the app.
 * @param app The express app
 */
export function setupDebugEndpoints(app: Express) {
  app.get("/debug", (_, res) => res.send(debugIndexHtml));

  addSimpleDebugEndpoint(app, "GET", "/dump", storeDumpQuerySchema, storeDump);
  addSimpleDebugEndpoint(app, "GET", "/configuration", emptySchema, () =>
    Promise.resolve(config)
  );
  addSimpleDebugEndpoint(app, "GET", "/clear-store", emptySchema, () =>
    Promise.resolve(clearStore)
  );
  addSimpleDebugEndpoint(app, "GET", "/force-error", emptySchema, async () => {
    throw new Error("Forced error by debug action.");
  });
  addSimpleDebugEndpoint(
    app,
    "GET",
    "/delete-all-job-templates",
    emptySchema,
    deleteAllJobTemplates
  );

  addSimpleDebugEndpoint(
    app,
    "GET",
    "/start/:urlPath",
    emptySchema,
    async (_, params) => {
      const urlPath = params?.urlPath;
      if (!urlPath)
        throw new Error(`Url parameter path needs to be present. Not found. `);
      const jobTemplate = getJobTemplates().find((jt) => {
        return jt instanceof RestJobTemplate && jt.urlPath === urlPath;
      });

      if (!jobTemplate)
        throw new Error(`Job template with url path "${urlPath}" not found`);
      const job = await jobTemplate.invoke();
      const progressUrl = `${config.env.ROOT_URL_PATH}/progress/${job.uuid}`;
      const queueUrl = `${config.env.ROOT_URL_PATH}/queue`;
      return `Job with uuid "${job.uuid}" started successfully. To check progress surf to <a href="${progressUrl}">${progressUrl}</a>. To see the job queue go to <a href="${queueUrl}">${queueUrl}</a>`;
    }
  );

  const createPeriodicJobTemplateSchema = z.object({
    datamonitoringFunction: datamonitoringFunctionSchema,
    timeOfInvocation: invocationTimeSchema,
    invocationDays: z.union([
      invocationDaysSchema,
      z.literal("ALL"),
      z.undefined(),
    ]),
  });

  addSimpleDebugEndpoint(
    app,
    "GET",
    "/create-periodic-job-template",
    createPeriodicJobTemplateSchema,
    async (query: z.infer<typeof createPeriodicJobTemplateSchema>) => {
      const defaultedInvocationDays =
        query.invocationDays === "ALL" || !query.invocationDays
          ? ALL_DAYS_OF_WEEK
          : query.invocationDays;
      const newTemplate = await createPeriodicJobTemplate(
        query.datamonitoringFunction,
        query.timeOfInvocation,
        defaultedInvocationDays
      );
      return `Periodic job template with uri "${newTemplate.uri}" and uuid "${newTemplate.uuid}" has been created,`;
    }
  );

  const uuidSchema = z.object({
    uuid: z.string().min(5),
  });

  addSimpleDebugEndpoint(
    app,
    "GET",
    "/delete-job-template",
    uuidSchema,
    async (query: z.infer<typeof uuidSchema>) => {
      const tj = getJobTemplate(query.uuid);
      if (!tj)
        throw new Error(`Job Template with uuid "${query.uuid}" not found.`);
      await tj.deleteFromDb();
      return `Template job successfully deleted`;
    }
  );

  const cleanJobSchema = z
    .object({
      all: z.literal("true").optional(),
    })
    .optional();

  addSimpleDebugEndpoint(
    app,
    "GET",
    "/clean-jobs",
    cleanJobSchema,
    async (query: z.infer<typeof cleanJobSchema>) => {
      const all = !!query?.all;
      if (all) {
        await deleteJobs([JobStatus.ERROR, JobStatus.FINISHED]);
        return `Jobs with status error and finished removed from the database`;
      } else {
        await deleteJobs();
        return `All jobs are removed from the database. Restart the service.`;
      }
    }
  );

  // COMPLEX ENDPOINTS. INVOKE EXPRESS REQUEST HANDLER (imported from functions.ts)

  addDebugEndpoint(app, "GET", "/job-templates", emptySchema, showJobTemplates);
  addDebugEndpoint(app, "GET", "/queue", emptySchema, showQueue);
  addDebugEndpoint(app, "GET", "/progress/:uuid", emptySchema, showProgress);

  app.get("/event-stream/:uuid", (req: Request, res: Response): void => {
    const uuid = req.params.uuid;
    if (!uuid) throw new Error("Uuid URL parameter not present");
    // Find task
    const job = getJobs().find((j) => j.uuid === uuid);
    if (!job) {
      const message = `Job with uuid "${uuid}" does not exist`;
      logger.error(`Event stream requested: ${message}`);
      res.status(400).send(message);
      return;
    }
    if (job.status === JobStatus.FINISHED || job.status === JobStatus.ERROR) {
      res.status(406).send(`Job already finished`);
    }

    // Generate event listeners in a record
    const listenerFunctions = ["update", "progress", "status"].reduce<
      Record<string, (messageObject: Record<string, any>) => void>
    >((acc, curr) => {
      acc[curr] = function (messageObject: Record<string, any>) {
        res.write(`data: ${JSON.stringify({ [curr]: messageObject })}\n\n`); // The double NEWLINE is very important
      };
      return acc;
    }, {});

    // Add event listeners
    for (const [kind, listener] of Object.entries(listenerFunctions))
      job.eventEmitter.addListener(kind, listener);

    // Specific headers for serves side events
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    logger.http(`Client requested sse progress stream for job uuid ${uuid}`);

    res.on("close", () => {
      logger.http(`Client dropped sse progress stream for job uuid ${uuid}`);
      // Remove all event listeners
      for (const [kind, listener] of Object.entries(listenerFunctions))
        job.eventEmitter.removeListener(kind, listener);
      res.end();
    });
  });

  // Static hosting of the dump files
  app.get("/dump-files", (_, res) => {
    const dirs = fs.readdirSync(config.env.DUMP_FILES_LOCATION, {
      encoding: "utf-8",
    });
    res.send(staticIndexTemplate({ dirs }));
  });
  app.use("/dump-files", express.static(config.env.DUMP_FILES_LOCATION));
} // End setupDebugEndpoints

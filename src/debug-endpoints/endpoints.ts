import { config } from "../configuration.js";
import express, { Express, Request, Response } from "express";
import fs from "node:fs";
import { clearStore, dumpStore } from "../queries/store.js";
import { z } from "zod";
import {
  addDebugEndpoint,
  addSimpleDebugEndpoint,
  debugErrorHandlingMiddelware,
  debugHtmlRenderMiddleware,
} from "./middleware.js";
import Handlebars from "handlebars";
import { deleteAllJobs } from "../job/job-template.js";
import { showJobs, startTask } from "./functions.js";
import { getJobs } from "../job/job.js";
import { logger } from "../logger.js";
import { now } from "../util/date-time.js";

const debugIndexHtml = Handlebars.compile(
  fs.readFileSync("./templates/debug.hbs", {
    encoding: "utf-8",
  })
)({});

const staticIndexTemplate = Handlebars.compile(
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

async function storeDump(query: z.infer<typeof storeDumpQuerySchema>) {
  const defaultedFilenameWithoutExtention =
    query.filename ?? "dump-" + now().format("YYYYMMDDHHmm");
  dumpStore(
    `${config.env.DUMP_FILES_LOCATION}/${defaultedFilenameWithoutExtention}.ttl`
  );
}

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
    "/delete-all-jobs",
    emptySchema,
    deleteAllJobs
  );

  addDebugEndpoint(app, "GET", "/jobs", emptySchema, showJobs);

  addDebugEndpoint(app, "GET", "/start/:restPath", emptySchema, startTask);

  app.get("/progress/:uuid", [
    (req: Request, res: Response): void => {
      const uuid = req.params.uuid;
      if (!uuid) throw new Error("Uuid URL parameter not present");
      // Find task
      const task = getJobs().find((t) => t.uuid === uuid);
      if (!task) throw new Error("No running task with this UUID found.");

      // Generate event listeners in a record
      const listenerFunctions = ["update", "progress", "status"].reduce<
        Record<string, (message: any) => void>
      >((acc, curr) => {
        acc[curr] = function (message: Record<string, any>) {
          logger.debug(
            `Event of kind ${curr} received. Message is ${JSON.stringify({
              [curr]: message,
            })}`
          );
          res.write(`data: ${JSON.stringify({ [curr]: message })}\n\n`); // The double NEWLINE is very important
        };
        return acc;
      }, {});
      // Add them
      for (const [kind, listener] of Object.entries(listenerFunctions))
        task.eventEmitter.addListener(kind, listener);

      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      logger.http(`Client requested sse progress stream for task uuid ${uuid}`);

      res.on("close", () => {
        logger.http(`Client dropped sse progress stream for task uuid ${uuid}`);
        // Remove all event listeners
        for (const [kind, listener] of Object.entries(listenerFunctions))
          task.eventEmitter.removeListener(kind, listener);
        res.end();
      });
    },
    debugErrorHandlingMiddelware,
    debugHtmlRenderMiddleware,
  ]);

  // Static hosting of the dump files
  app.get("/dump-files", (_, res) => {
    const dirs = fs.readdirSync(config.env.DUMP_FILES_LOCATION, {
      encoding: "utf-8",
    });
    res.send(staticIndexTemplate({ dirs }));
  });
  app.use("/dump-files", express.static(config.env.DUMP_FILES_LOCATION));
}

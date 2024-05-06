import { config } from "configuration.js";
import { DateOnly, DATE_ISO_REGEX } from "date-util.js";
import dayjs from "dayjs";
import express, { Express } from "express";
import fs from "node:fs";
import { clearStore, dumpStore } from "queries/store.js";
import { z } from "zod";
import { addDebugEndpoint } from "./debug-functions.js";
import Handlebars from "handlebars";
import { deleteAllJobs, getJobs } from "job/job.js";

const debugIndexHtml = fs.readFileSync("./templates/debug.html", {
  encoding: "utf-8",
});

const staticIndexTemplate = Handlebars.compile(
  fs.readFileSync("./templates/static-index.hbs", { encoding: "utf-8" })
);

const generateReportQuerySchema = z
  .object({
    day: z
      .string()
      .regex(
        DATE_ISO_REGEX,
        "Day parameter needs to be ISO formatted YYYY-MM-DD."
      )
      .transform((string) => new DateOnly(string))
      .optional(),
  })
  .strict();

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
    query.filename ?? "dump-" + dayjs().format("YYYYMMDDHHmm");
  dumpStore(
    `${config.env.DUMP_FILES_LOCATION}/${defaultedFilenameWithoutExtention}.ttl`
  );
}

export function setupDebugEndpoints(app: Express) {
  app.get("/debug", (_, res) => res.send(debugIndexHtml));

  addDebugEndpoint(app, "GET", "/dump", storeDumpQuerySchema, storeDump);
  addDebugEndpoint(app, "GET", "/configuration", emptySchema, () =>
    Promise.resolve(config)
  );
  addDebugEndpoint(app, "GET", "/clear-store", emptySchema, () =>
    Promise.resolve(clearStore)
  );
  addDebugEndpoint(app, "GET", "/force-error", emptySchema, async () => {
    throw new Error("Forced error by debug action.");
  });
  addDebugEndpoint(app, "GET", "/delete-all-jobs", emptySchema, deleteAllJobs);

  // Static hosting of the dump files
  app.get("/dump-files", (_, res) => {
    const dirs = fs.readdirSync(config.env.DUMP_FILES_LOCATION, {
      encoding: "utf-8",
    });
    res.send(staticIndexTemplate({ dirs }));
  });
  app.use("/dump-files", express.static(config.env.DUMP_FILES_LOCATION));
}

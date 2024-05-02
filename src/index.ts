import cors, { CorsOptions } from "cors";
import express, { Express } from "express";
import { generateReports } from "./report-generation.js";
import { DateOnly, VALID_ISO_DATE_REGEX } from "./date-util.js";
import { schedule } from "node-cron";
import logger from "./logger.js";
import { config } from "./configuration.js";
import { addDebugEndpoint } from "middleware.js";
import { z } from "zod";
import { durationWrapper } from "util/util.js";
import { clearStore, dumpStore } from "report-generation/store.js";
import dayjs from "dayjs";

// Init express server

const corsOptions: CorsOptions = {
  origin: ["http://localhost:4200", "http://localhost:9300"],
  methods: ["GET"],
  optionsSuccessStatus: 200,
};

const app: Express = express();
app.use(cors(corsOptions));

// Some useful health endpoints indicating that the process is running

app.get("/ping", async (_, res) => {
  res.send({ pong: "true" });
});
app.get("/status", async (_, res) => {
  res.send({ running: "true" });
});

// Debug endpoint for development

if (!config.env.DISABLE_DEBUG_ENDPOINT) {
  const emptySchema = z.union([z.undefined(), z.object({})]);
  // Function for forcing generation
  const generateReportQuerySchema = z
    .object({
      day: z
        .string()
        .regex(
          VALID_ISO_DATE_REGEX,
          "Day parameter needs to be ISO formatted YYYY-MM-DD."
        )
        .transform((string) => new DateOnly(string))
        .optional(),
    })
    .strict();

  async function debugGenerateReports(
    query: z.infer<typeof generateReportQuerySchema>
  ) {
    const defaultedDay = query.day ?? DateOnly.yesterday();
    return await generateReports(defaultedDay);
  }

  addDebugEndpoint(
    app,
    "GET",
    "/generate-reports-now",
    generateReportQuerySchema,
    debugGenerateReports
  );

  const storeDumpQuerySchema = z
    .object({
      filename: z
        .string()
        .regex(/[\w\d\-]+/)
        .optional(),
    })
    .strict();

  async function storeDump(query: z.infer<typeof storeDumpQuerySchema>) {
    const defaultedFilename =
      query.filename ?? "dump-" + dayjs().format("YYYY-MM-DD");
    await dumpStore(
      `${config.env.DUMP_FILES_LOCATION}/${defaultedFilename}.ttl`
    );
  }

  addDebugEndpoint(app, "GET", "/dump", storeDumpQuerySchema, storeDump);

  addDebugEndpoint(app, "GET", "/configuration", emptySchema, () =>
    Promise.resolve(config)
  );

  addDebugEndpoint(app, "GET", "/clear-store", emptySchema, () =>
    Promise.resolve(clearStore)
  );
}

// Start cron

schedule(config.env.REPORT_CRON_EXPRESSION, (now) => {
  durationWrapper(generateReports, [DateOnly.yesterday()], "info", now);
});

logger.info(`CRON started with "${config.env.REPORT_CRON_EXPRESSION}"`);

// Start server
app.listen(config.env.SERVER_PORT, () => {
  logger.info(
    `Report generation microservice started and listening on ${config.env.SERVER_PORT}.`
  );
});

// Catch CTRL+C and docker kill signal
process.on("SIGINT", () => {
  logger.info("SIGIT received. Stopping.");
  process.exit(0);
});

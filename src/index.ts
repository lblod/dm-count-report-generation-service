import cors, { CorsOptions } from "cors";
import express, { Express } from "express";
import { generateReports } from "./report-generation.js";
import { DateOnly, VALID_ISO_DATE_REGEX } from "./date.js";
import { schedule } from "node-cron";
import dayjs from "dayjs";
import { durationWrapper } from "./cron.js";
import logger from "./logger.js";
import { config } from "./configuration.js";
import {
  addDebugEndpoint,
  debugErrorHandlingMiddelware,
  debugHtmlRenderMiddleware,
  getZodQueryValidationMiddleware,
} from "middleware.js";
import { z } from "zod";

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

  addDebugEndpoint(app, "GET", "/configuration", undefined, () =>
    Promise.resolve(config)
  );
}

// Start cron

schedule(config.env.REPORT_CRON_EXPRESSION, (now) => {
  durationWrapper(now, generateReports, [DateOnly.yesterday()]);
});

// Start server
app.listen(config.env.SERVER_PORT, () => {
  logger.info(
    `Report generation microservice started and listening on ${config.env.SERVER_PORT}.`
  );
});

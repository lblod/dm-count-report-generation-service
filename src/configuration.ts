import { z } from "zod";
import fs from "node:fs";
import {
  ALL_DAYS_OF_WEEK,
  PREFIXES,
  RESOURCE_CLASS_SHORT_URI_REGEX,
} from "./local-constants.js"; // Not named 'constants' because of name conflict with node. Same of the nam of this module.
import { fromError } from "zod-validation-error";
import { DayOfWeek, LOG_LEVELS, stringToDayOfWeek } from "types.js";
import { TimeOnly, TIME_ANY_NOTATION_REGEX } from "date-util.js";

// Extract namespaces and build a conversion function to convert short URI's to full ones

export function isShortUri(uri: string): boolean {
  return RESOURCE_CLASS_SHORT_URI_REGEX.test(uri);
}
const EXTRACT_NAMESPACES_FROM_PREFIX_REGEX = /PREFIX\s([a-z]+):\s+<(.+)>/g;

export const PREFIXES_MAP = [
  ...PREFIXES.matchAll(EXTRACT_NAMESPACES_FROM_PREFIX_REGEX),
].reduce<Map<string, string>>((acc, curr) => {
  acc.set(curr[1]!, curr[2]!);
  return acc;
}, new Map<string, string>());
export const PREFIXES_RECORD: Record<string, string> = [
  ...PREFIXES_MAP.entries(),
].reduce((acc, curr) => {
  acc[curr[0]] = curr[1];
  return acc;
}, {} as Record<string, string>);

function convertUri(shortOrLong: string): string {
  const match = shortOrLong.match(RESOURCE_CLASS_SHORT_URI_REGEX);
  return match ? `${PREFIXES_MAP.get(match[1]!)}${match[2]!}` : shortOrLong;
}

// Zod schemas to parse env and the file.
const allowedTrueValues = ["true", "on", "1"];
const allowedFalseValues = ["false", "off", "0"];
const envBooleanSchema = z
  .string()
  .toLowerCase()
  .transform((x, ctx) => {
    const lower = x.toLowerCase();
    if (allowedTrueValues.includes(lower)) return true;
    if (allowedFalseValues.includes(lower)) return false;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Boolean env vars (case insensitive) need to be one of ${allowedTrueValues} or ${allowedFalseValues} in order to signal true or false respectively.`,
    });
    return z.never;
  })
  .pipe(z.boolean());
const envIntegerSchema = z
  .string()
  .transform((x, ctx) => {
    const integer = parseInt(x);
    if (isNaN(integer)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Integer env vars need to be able to be parsed as an integer.`,
      });
      return z.never;
    }
    return integer;
  })
  .pipe(z.number().int());
const uriSchema = z
  .string()
  .url()
  .or(z.string().regex(RESOURCE_CLASS_SHORT_URI_REGEX));
const invocationTimeSchema = z
  .string()
  .regex(TIME_ANY_NOTATION_REGEX)
  .transform((x) => new TimeOnly(x));
const invocationDaysSchema = z
  .string()
  .transform((x, ctx) => {
    const result = x.split(",").map((str) => stringToDayOfWeek(str));
    if (result.some((r) => !r)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invocaton days env var needs to be of format "<day>,<day>" where <day> is one of ${Object.keys(
          DayOfWeek
        ).join(",")}`,
      });
      return z.never();
    }
    return [...new Set(result)]; // Remove duplicate days if present
  })
  .pipe(z.array(z.nativeEnum(DayOfWeek)));

const dmReportGenerationServiceConfigFileSchema = z.object({
  endpoints: z.array(
    z.object({
      url: z.string().url(),
      classes: z.array(uriSchema),
    })
  ),
});

const dmReportGenerationServiceEnvSchema = z.object({
  ADMIN_UNIT_ENDPOINT: z.string().url(),
  REPORT_ENDPOINT: z.string().url(),
  DISABLE_DEBUG_ENDPOINT: envBooleanSchema.optional(),
  REPORT_GRAPH_URI: z.string().optional(),
  JOB_GRAPH_URI: z.string().optional(),
  CONFIG_FILE_LOCATION: z.string().optional(),
  SLEEP_BETWEEN_QUERIES_MS: envIntegerSchema.optional(),
  SHOW_SPARQL_QUERIES: envBooleanSchema.optional(),
  LIMIT_NUMBER_ADMIN_UNITS: envIntegerSchema.optional(),
  ORG_RESOURCES_TTL_S: envIntegerSchema.optional(),
  SERVER_PORT: envIntegerSchema.optional(),
  REPORT_INVOCATION_TIME: invocationTimeSchema.optional(),
  REPORT_INVOCATION_DAYS: invocationDaysSchema.optional(),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  NO_TIME_FILTER: envBooleanSchema.optional(),
  DUMP_FILES_LOCATION: z.string().optional(),
});

// Useful types

export type DmReportGenerationServiceConfigFile = z.infer<
  typeof dmReportGenerationServiceConfigFileSchema
>;

export type EndpointConfig = {
  url: string;
  classes: readonly string[];
};

export type DmReportGenerationServiceEnv = z.infer<
  typeof dmReportGenerationServiceEnvSchema
>;

export type DmReportGenerationServiceConfig = {
  file: EndpointConfig[];
  env: Required<DmReportGenerationServiceEnv>;
};

// Manage and parse environment

const defaultEnv = {
  DISABLE_DEBUG_ENDPOINT: false,
  REPORT_GRAPH_URI: "http://mu.semte.ch/graphs/public",
  JOB_GRAPH_URI: "http://mu.semte.ch/graphs/job",
  CONFIG_FILE_LOCATION: "/config",
  SLEEP_BETWEEN_QUERIES_MS: 0,
  SHOW_SPARQL_QUERIES: false,
  LIMIT_NUMBER_ADMIN_UNITS: 0, // Default value of 0 means no limit
  ORG_RESOURCES_TTL_S: 300, // Default cache TTL is five minutes
  SERVER_PORT: 80, // HTTP (TODO add HTTPS port)
  REPORT_INVOCATION_TIME: new TimeOnly("00:00"),
  REPORT_INVOCATION_DAYS: ALL_DAYS_OF_WEEK,
  LOG_LEVEL: "info" as const,
  NO_TIME_FILTER: false,
  DUMP_FILES_LOCATION: "/dump",
};

const envResult = dmReportGenerationServiceEnvSchema.safeParse(process.env);

if (!envResult.success) {
  throw fromError(envResult.error);
}

const defaultedEnv: Required<DmReportGenerationServiceEnv> = {
  ...defaultEnv,
  ...envResult.data,
};

// Parse config file, validate and export

const fileContents = JSON.parse(
  fs.readFileSync(defaultedEnv.CONFIG_FILE_LOCATION + "/config.json", {
    encoding: "utf-8",
  })
);

const fileResult =
  dmReportGenerationServiceConfigFileSchema.safeParse(fileContents);

if (!fileResult.success) {
  throw fromError(fileResult.error);
}

const endpointConfig: EndpointConfig[] = fileResult.data.endpoints.map(
  (fileEndpoint) => {
    return {
      url: fileEndpoint.url,
      classes: fileEndpoint.classes.map(convertUri),
    };
  }
);

export const config: DmReportGenerationServiceConfig = {
  env: defaultedEnv,
  file: endpointConfig,
};

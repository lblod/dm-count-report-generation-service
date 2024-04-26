import { z } from 'zod';
import fs from 'node:fs';
import { ZodParseError } from 'types/errors';
import { PREFIXES, RESOURCE_CLASS_SHORT_URI_REGEX } from 'local-constants'; // Not named 'constants' because of name conflict with node. Same of the nam of this module.

// Extract namespaces and build a conversion function to convert short URI's to full ones

export function isShortUri(uri:string):boolean {
  return RESOURCE_CLASS_SHORT_URI_REGEX.test(uri);
}
const EXTRACT_NAMESPACES_FROM_PREFIX_REGEX = /PREFIX\s([a-z]+)\:\s+<(.+)>/g;
const prefixMap = [...PREFIXES.matchAll(EXTRACT_NAMESPACES_FROM_PREFIX_REGEX)].reduce<Map<string,string>>(
  (acc,curr) => {
    acc.set(curr[1]!,curr[2]!);
    return acc;
  },
  new Map<string,string>(),
);

function convertUri(shortOrLong:string):string {
  const match = shortOrLong.match(RESOURCE_CLASS_SHORT_URI_REGEX);
  return match ? `${prefixMap.get(match[1]!)}${match[2]!}` : shortOrLong;
}

// Zod schemas to parse env and the file.
const allowedTrueValues = ["true","on","1"];
const allowedFalseValues = ["false","off","0"];
const envBooleanSchema = z.string().toLowerCase().transform((x,ctx) => {
  const lower = x.toLowerCase();
  if (allowedTrueValues.includes(lower)) return true;
  if (allowedFalseValues.includes(lower)) return false;
  ctx.addIssue({
    code:z.ZodIssueCode.custom,
    message: `Boolean env vars (case insensitive) need to be one of ${allowedTrueValues} or ${allowedFalseValues} in order to signal true or false respectively.`,
  });
  return z.never;
}).pipe(z.boolean());
const uriSchema = z.string().url().or(z.string().regex(RESOURCE_CLASS_SHORT_URI_REGEX));

const dmReportGenerationServiceConfigFileSchema = z.object({
  endpoints: z.array(z.object({
    url: z.string().url(),
    classes: z.array(uriSchema),
  })),
});

const dmReportGenerationServiceEnvSchema = z.object({
  'DISABLE_DEBUG_ENDPOINT': envBooleanSchema.optional(),
  'REPORT_GRAPH_URI': z.string().optional(),
  'ADMIN_UNIT_ENDPOINT': z.string().url(),
  'REPORT_ENDPOINT': z.string().url(),
  'CONFIG_FILE_LOCATION': z.string().optional(),
})

// Useful types

export type DmReportGenerationServiceConfigFile = z.infer<typeof dmReportGenerationServiceConfigFileSchema>;

export type EndpointConfig = {
  url: string,
  classes: readonly string[],
}

export type DmReportGenerationServiceEnv = z.infer<typeof dmReportGenerationServiceEnvSchema>;

export type DmReportGenerationServiceConfig = {
  file: EndpointConfig[],
  env: Required<DmReportGenerationServiceEnv>,
}

// Manage and parse environment

const defaultEnv = {
  DISABLE_DEBUG_ENDPOINT: false,
  REPORT_GRAPH_URI: "http://mu.semte.ch/graphs/public",
  CONFIG_FILE_LOCATION: "/config",
};

const envResult = dmReportGenerationServiceEnvSchema.safeParse(process.env);

if (!envResult.success) {
  throw new ZodParseError(`Environment variables are not in the correct schema`,envResult.error)
}

const defaultedEnv: Required<DmReportGenerationServiceEnv>  = {
  ...defaultEnv,
  ...envResult.data,
}

// Parse config file, validate and export

const fileContents = JSON.parse(fs.readFileSync(defaultedEnv.CONFIG_FILE_LOCATION + "/config.json",{encoding: "utf-8"}));

const fileResult = dmReportGenerationServiceConfigFileSchema.safeParse(fileContents);

if (!fileResult.success) {
  throw new ZodParseError(`Config file is not in the correct schema`,fileResult.error);
}

const endpointConfig: EndpointConfig[] = fileResult.data.endpoints.map((fileEndpoint)=> {
  return {
    url: fileEndpoint.url,
    classes: fileEndpoint.classes.map(convertUri),
  }
});

export const config: DmReportGenerationServiceConfig = {
  env: defaultedEnv,
  file: endpointConfig,
}

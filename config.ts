import { z } from 'zod';
import { ZodParseError } from './types/errors';
import fs from 'node:fs';
import { PREFIXES } from './report-generation/queries';

// Constants

const RESOURCE_CLASS_SHORT_URI_REGEX = /^([\w\d-]+)\:([\w\d-]+)$/;
const EXTRACT_NAMESPACES_FROM_PREFIX_REGEX = /PREFIX\s([a-z]+)\:\s+<(.+)>/g;

export function isShortUri(uri:string):boolean {
  return RESOURCE_CLASS_SHORT_URI_REGEX.test(uri);
}
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
})

export type DmReportGenerationServiceConfigFile = z.infer<typeof dmReportGenerationServiceConfigFileSchema>;

export type EndpointConfig = {
  url: string,
  classes: readonly string[],
}

export type DmReportGenerationServiceEnv = z.infer<typeof dmReportGenerationServiceEnvSchema>;

export type DmReportGenerationServiceConfig = {
  file: EndpointConfig[],
  env: DmReportGenerationServiceEnv,
}

const defaultEnv = {
  DISABLE_DEBUG_ENDPOINT: false,
  REPORT_GRAPH_URI: "http://mu.semte.ch/graphs/public"
};

// Parse env
const envResult = dmReportGenerationServiceEnvSchema.safeParse(process.env);

if (!envResult.success) {
  throw new ZodParseError(`Environment variables are not in the correct schema`,envResult.error)
}

const defaultedEnv: Required<DmReportGenerationServiceEnv>  = {
  ...defaultEnv,
  ...envResult.data,
}

// Parse file and validate
const fileContents = JSON.parse(fs.readFileSync("/config/config.json",{encoding: "utf-8"}));

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

const config: DmReportGenerationServiceConfig = {
  env: defaultedEnv,
  file: endpointConfig,
}


// Config is 100% Safe and validated
export default config;

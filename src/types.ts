export type IsEmpty<T> = T extends [] ? true : false;

export type HasOneElement<T extends any[]> = T["length"] extends 1
  ? true
  : false;

export type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | JsonSerializable[]
  | { [key: string]: JsonSerializable }
  | undefined;

//TODO Make uri prefixes reliant on the configuration

export enum JobStatus {
  BUSY = `https://codifly.be/ns/resources/status/busy`,
  NOT_STARTED = `https://codifly.be/ns/resources/status/not-started`,
  FINISHED = `https://codifly.be/ns/resources/status/finished`,
  ERROR = `https://codifly.be/ns/resources/status/failed`,
}

export enum JobTemplateStatus {
  ACTIVE = `https://codifly.be/ns/resources/status/active`,
  NOT_STARTED = `https://codifly.be/ns/resources/status/not-started`,
  FINISHED = `https://codifly.be/ns/resources/status/finished`,
  INACTIVE = `https://codifly.be/ns/resources/status/inactive`,
}

export enum JobType {
  SERIAL = `https://codifly.be/ns/resources/task-type/serial`,
  PARALLEL = `https://codifly.be/ns/resources/task-type/parallel`,
}

export enum JobTemplateType {
  PERIODIC = `https://codifly.be/ns/resources/job-type/periodic`,
  REST_INVOKED = `https://codifly.be/ns/resources/job-type/rest-invoked`,
}

export enum DayOfWeek {
  MONDAY = `http://www.w3.org/2006/time#Monday`,
  TUESDAY = `http://www.w3.org/2006/time#Tuesday`,
  WEDNESDAY = `http://www.w3.org/2006/time#Wednesday`,
  THURSDAY = `http://www.w3.org/2006/time#Thursday`,
  FRIDAY = `http://www.w3.org/2006/time#Friday`,
  SATURDAY = `http://www.w3.org/2006/time#Saturday`,
  SUNDAY = `http://www.w3.org/2006/time#Sunday`,
}

/**
 * Transforms string like "SATURDAY" into a DayOfWeek enum value if possible. If the string is not a name of a day then it will return undefined
 * @param input a string
 * @returns DayOfWeek or undefined
 */
export function stringToDayOfWeek(input: string): DayOfWeek | undefined {
  if (!Object.keys(DayOfWeek).includes(input.toUpperCase())) return undefined;
  return (DayOfWeek as Record<string, DayOfWeek>)[input.toUpperCase()];
}

export enum DataMonitoringFunction {
  COUNT_RESOURCES = `https://codifly.be/ns/resources/dm-function/count-resources`,
  CHECK_HARVESTING_EXECUTION_TIME = `https://codifly.be/ns/resources/dm-function/check-harvesting-execution-time`,
  DUMMY = `https://codifly.be/ns/resources/dm-function/dummy`,
}

export type DmEnum =
  | JobType
  | JobStatus
  | JobTemplateStatus
  | DayOfWeek
  | DataMonitoringFunction;

export const dmEnums = [
  JobStatus,
  JobType,
  JobTemplateType,
  JobTemplateStatus,
  DayOfWeek,
  DataMonitoringFunction,
] as const;

const allUris = {
  ...JobStatus,
  ...JobType,
  ...JobTemplateType,
  ...JobTemplateStatus,
  ...DayOfWeek,
  ...DataMonitoringFunction,
} as const;

/**
 * Transform a string with a unique URI to one of the enum object. All linked data related enums in this project have unique values.
 * @param uri A uri
 * @returns A DmEnum which is a union of all URI based enums.
 */
export function getEnumFromUri(uri: string): DmEnum {
  for (const enumLike of dmEnums) {
    for (const value of Object.values(enumLike)) {
      if (value === uri) return uri as DmEnum;
    }
  }
  throw new Error(`No corresponding enum value found for uri ${uri}.`);
}

type GetEnumStringFromUriType = (
  uri: string,
  safe: boolean
) => true extends typeof safe ? string | undefined : string;
// TODO fix
/**
 * Given a uri find the enum key. E.g. 'https://codifly.be/ns/resources/task-type/parallel' will output 'PARALLEL'.
 * Useful for debugging, logging and display purposes because the keys are easier to read than the URI's.
 * @param uri The uri string you want to check
 * @param safe true means it will not throw and return undefined if the uri does not correspond to an enum value. False means it will throw. False is the safest.
 * @returns The enum key as a string.
 */
export const getEnumStringFromUri: GetEnumStringFromUriType = (
  uri: string,
  safe: boolean
) => {
  const result = Object.entries(allUris).find((entry) => entry[1] === uri);
  if (!safe) {
    if (!result)
      throw new Error(`No corresponding enum value found for uri ${uri}.`);
    return result[0] as string;
  }
  return (result ? result[0] : undefined) as string | undefined;
};

export const LOG_LEVELS = [
  "error",
  "warn",
  "info",
  "http",
  "verbose",
  "debug",
  "silly",
] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export type UpdateMessage = {
  timestamp: string;
  message: JsonSerializable;
};

export type ProgressMessage = {
  done: number;
  total: number;
  lastDurationMilliseconds: number | undefined | null;
  subProcessIdentifier: string | undefined;
};

export type StatusMessage =
  | {
      done: true;
      failed: false;
      result: object | number | string | boolean;
    }
  | {
      done: true;
      failed: true;
      error: object | number | string | boolean | Error;
    }
  | {
      done: false;
      failed: false;
    };

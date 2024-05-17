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

export enum TaskStatus {
  BUSY = "https://codifly.be/ns/resources/status/busy",
  NOT_STARTED = "https://codifly.be/ns/resources/status/not-started",
  FINISHED = "https://codifly.be/ns/resources/status/finished",
  ERROR = "https://codifly.be/ns/resources/status/failed",
}

export enum JobStatus {
  ACTIVE = "https://codifly.be/ns/resources/status/active",
  NOT_STARTED = "https://codifly.be/ns/resources/status/not-started",
  FINISHED = "https://codifly.be/ns/resources/status/finished",
  INACTIVE = "https://codifly.be/ns/resources/status/inactive",
}

export enum TaskType {
  SERIAL = "https://codifly.be/ns/resources/task-type/serial",
  PARALLEL = "https://codifly.be/ns/resources/task-type/parallel",
}

export enum JobType {
  PERIODIC = "https://codifly.be/ns/resources/job-type/periodic",
  REST_INVOKED = "https://codifly.be/ns/resources/job-type/rest-invoked",
}

export enum DayOfWeek {
  MONDAY = "http://www.w3.org/2006/time#Monday",
  TUESDAY = "http://www.w3.org/2006/time#Tuesday",
  WEDNESDAY = "http://www.w3.org/2006/time#Wednesday",
  THURSDAY = "http://www.w3.org/2006/time#Thursday",
  FRIDAY = "http://www.w3.org/2006/time#Friday",
  SATURDAY = "http://www.w3.org/2006/time#Saturday",
  SUNDAY = "http://www.w3.org/2006/time#Sunday",
}

export function stringToDayOfWeek(input: string): DayOfWeek | undefined {
  if (!Object.keys(DayOfWeek).includes(input.toUpperCase())) return undefined;
  return (DayOfWeek as Record<string, DayOfWeek>)[input.toUpperCase()];
}

export enum DataMonitoringFunction {
  COUNT_RESOURCES = "https://codifly.be/ns/resources/dm-function/count-resources",
  CHECK_HARVESTING_EXECUTION_TIME = "https://codifly.be/ns/resources/dm-function/check-harvesting-execution-time",
}

export type DmEnum =
  | TaskType
  | TaskStatus
  | JobStatus
  | DayOfWeek
  | DataMonitoringFunction;

export const dmEnums = [
  TaskStatus,
  TaskType,
  JobType,
  JobStatus,
  DayOfWeek,
  DataMonitoringFunction,
] as const;

const allUris = {
  ...TaskStatus,
  ...TaskType,
  ...JobType,
  ...JobStatus,
  ...DayOfWeek,
  ...DataMonitoringFunction,
} as const;

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
 *
 * @param uri The uri string you want to check
 * @param safe true means it will not throw and return undefined if the uri does not correspond to an enum value
 * @returns The enum key.
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

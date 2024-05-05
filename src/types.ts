import dayjs from "dayjs";

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
  ONCE = "https://codifly.be/ns/resources/job-type/once",
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
  GENERATE_REPORTS = "https://codifly.be/ns/resources/dm-function/generate-reports",
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
];

export function getEnumFromUri(uri: string): DmEnum {
  for (const enumLike of dmEnums) {
    for (const value of Object.values(enumLike)) {
      if (value === uri) return uri as DmEnum;
    }
  }
  throw new Error(`No corresponding enum value found for uri ${uri}.`);
}

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
  timestamp: dayjs.Dayjs;
  message: string;
};

export type ProgressMessage = {
  done: number;
  total: number;
  lastDurationMilliseconds: number | undefined | null;
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

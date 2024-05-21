import { JsonSerializable } from "./types.js";
import { config } from "./configuration.js";
import winston from "winston";
import { DateOnly, TimeOnly } from "./util/date-time.js";
import dayjs from "dayjs";
import { JobTemplate } from "./job/job-template.js";
import { Job } from "./job/job.js";

const winstonLogger = winston.createLogger({
  level: config.env.LOG_LEVEL,
  format: winston.format.cli(),
  transports: [new winston.transports.Console()],
});

export function isJsonSerializable(input: any): input is JsonSerializable {
  return (
    typeof input === "string" ||
    typeof input === "number" ||
    typeof input === "boolean" ||
    input === null ||
    Array.isArray(input) ||
    typeof input === "object"
  );
}

export function replacer(_key: string, value: any): JsonSerializable {
  if (typeof value === "object") {
    if (value instanceof DateOnly) return value.toString();
    if (value instanceof TimeOnly) return value.toString();
    if (dayjs.isDayjs(value)) return value.format();
    if (value instanceof JobTemplate) return value.toString();
    if (value instanceof Job) return "Task instance";
  }
  return value;
}

export const logger = winstonLogger;

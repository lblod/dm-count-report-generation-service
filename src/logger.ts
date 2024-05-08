import { IsEmpty, JsonSerializable } from "./types.js";
import { config } from "./configuration.js";
import winston from "winston";
import { DateOnly, TimeOnly } from "./date-util.js";
import dayjs from "dayjs";
import { Job } from "./job/job.js";
import { Task } from "./job/task.js";

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

function replacer(_key: string, value: any): JsonSerializable {
  if (typeof value === "object") {
    if (value instanceof DateOnly) return value.toString();
    if (value instanceof TimeOnly) return value.toString();
    if (dayjs.isDayjs(value)) return value.format();
    if (value instanceof Job) return value.toString();
    if (value instanceof Task) return "Task instance";
  }
  return value;
}

export function extendedLog(
  ...args: any[] | []
): IsEmpty<typeof args> extends true ? undefined : string {
  if (args.length === 0)
    return undefined as unknown as IsEmpty<typeof args> extends true
      ? undefined
      : string;
  const outputstrings = args.map((val) => {
    if (
      typeof val === "string" ||
      typeof val === "number" ||
      typeof val === "boolean"
    ) {
      return val;
    }
    return JSON.stringify(val, replacer, 3);
  });
  if (args.length === 1) return outputstrings[0] as string;
  return outputstrings.join(",\n") as string;
}

type WinstonLogFunc = typeof winstonLogger.info;
type ExtendedLogFunc = (...args: any[]) => ReturnType<WinstonLogFunc>;

function wrapLogMethod(method: WinstonLogFunc): ExtendedLogFunc {
  return (...args: any[]) => {
    return method(extendedLog(...args));
  };
}

class ExtendedLogger {
  #logger: winston.Logger;
  get logger() {
    return this.#logger;
  }
  declare silly: ExtendedLogFunc;
  declare debug: ExtendedLogFunc;
  declare verbose: ExtendedLogFunc;
  declare http: ExtendedLogFunc;
  declare info: ExtendedLogFunc;
  declare warn: ExtendedLogFunc;
  declare error: ExtendedLogFunc;
  declare log: (
    level: Parameters<typeof winstonLogger.log>[0],
    ...args: any[]
  ) => ReturnType<typeof winstonLogger.log>;
  constructor(wrapped: winston.Logger) {
    this.#logger = wrapped;
    this.silly = wrapLogMethod(this.#logger.silly);
    this.debug = wrapLogMethod(this.#logger.debug);
    this.verbose = wrapLogMethod(this.#logger.verbose);
    this.http = wrapLogMethod(this.#logger.http);
    this.info = wrapLogMethod(this.#logger.info);
    this.warn = wrapLogMethod(this.#logger.warn);
    this.error = wrapLogMethod(this.#logger.error);
    this.log = function (level, ...args: any[]) {
      return this.#logger.log(level, extendedLog(...args));
    };
  }
}

export const logger = new ExtendedLogger(winstonLogger);

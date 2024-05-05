import { LOG_LEVELS, LogLevel } from "types.js";
import { config } from "./configuration.js";
import winston from "winston";

const winstonLogger = winston.createLogger({
  level: config.env.LOG_LEVEL,
  format: winston.format.cli(),
  transports: [new winston.transports.Console()],
});

export function extendedLog(...args: any[]): string {
  const outputstrings = args.map((arg: any) => {
    if (typeof arg === "object") {
      return JSON.stringify(arg, undefined, 3) + "\n";
    }
    return arg.toString();
  });
  if (outputstrings.length === 0) return "";
  if (outputstrings.length === 1) return outputstrings[0];
  return outputstrings.join(",\n");
}

type WinstonLogFunc = typeof winstonLogger.info;

const proxyHandler = {
  get(winstonLogger: winston.Logger, prop: string | LogLevel, receiver: any) {
    if (LOG_LEVELS.includes(prop as LogLevel)) {
      const logfunction: WinstonLogFunc = winstonLogger[
        prop as unknown as keyof winston.Logger
      ] as WinstonLogFunc;
      return function (...args: any): void {
        logfunction(extendedLog(...args));
      };
    }
    if (prop === "log") {
      return function (logLevel: LogLevel, ...args: any) {
        winstonLogger.log(logLevel, extendedLog(...args));
      };
    }
    return Reflect.get(winstonLogger, prop, receiver);
  },
};

export default new Proxy(winstonLogger, proxyHandler);

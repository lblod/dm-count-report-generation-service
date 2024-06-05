import { config } from "./configuration.js";
import winston from "winston";

/*
This module contains the default logger of the app. If you want to change it change it here.
*/

const winstonLogger = winston.createLogger({
  level: config.env.LOG_LEVEL,
  format: winston.format.cli(),
  transports: [new winston.transports.Console()],
});

// The default logger of the app
export const logger = winstonLogger;

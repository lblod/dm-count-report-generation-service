import { EventEmitter } from "node:events";
import { Express } from "express";
import logger from "logger.js";

class ProgressEventEmitter extends EventEmitter {}

export const progressEventEmitter = new ProgressEventEmitter();

export function reportProgress(
  progress: number,
  total: number,
  finished: boolean,
  metric: number | undefined | null = undefined,
  message = "",
  result: undefined | object = undefined
) {
  progressEventEmitter.emit(
    "progress",
    progress,
    total,
    finished,
    metric,
    message,
    result
  );
  logger.http(
    `Report progresss of report generation:\n${JSON.stringify({
      progress,
      total,
      finished,
      metric,
      message,
      result,
    })}`
  );
}

export function addSSE(app: Express): void {
  app.get("/progress", (req, res) => {
    const listenerFunction = function (
      progress: number,
      total: number,
      finished: boolean,
      metric: number | undefined | null,
      message: string,
      result: undefined | object
    ) {
      res.write(
        `data: ${JSON.stringify({
          progress,
          total,
          finished,
          metric,
          message,
          result,
        })}\n\n`
      );
    };
    progressEventEmitter.addListener("progress", listenerFunction);

    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    res.on("close", () => {
      logger.http("Client dropped sse progress stream");
      progressEventEmitter.removeListener("progress", listenerFunction);
      res.end();
    });
  });
}

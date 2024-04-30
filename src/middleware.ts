import express from "express";
import { z, ZodObject } from "zod";
import { fromError, fromZodError } from "zod-validation-error";
import fs from "node:fs";
import { durationWrapper } from "cron.js";
import dayjs from "dayjs";
import Handlebars from "handlebars";

const debugResultTemplate = Handlebars.compile(
  fs.readFileSync("./templates/debug-output.hbs", { encoding: "utf-8" })
);
const errorResultTemplate = Handlebars.compile(
  fs.readFileSync("./templates/error-output.hbs", { encoding: "utf-8" })
);

export function getZodQueryValidationMiddleware(
  querySchema: ZodObject<any, any>
): (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => void {
  return function zodQueryValidationMiddleware(
    req: express.Request<any, any, any, z.infer<typeof querySchema>>,
    res: express.Response,
    next: express.NextFunction
  ) {
    const parse = querySchema.safeParse(req.query);
    if (!parse.success) {
      const validationError = fromError(parse.error);
      const html = errorResultTemplate({
        title: `Query parsing failed`,
        method: req.method + " " + req.originalUrl,
        message: validationError.message,
        query: JSON.stringify(req.query),
        error: validationError.toString(),
      });
      res.statusCode = 500;
      res.statusMessage = "Validation error";
      res.send(html);
      return;
    }
    next();
  };
}

export function debugHtmlRenderMiddleware(
  req: express.Request,
  res: express.Response
) {
  res.appendHeader("content-type", "text/html");
  const html = debugResultTemplate({
    title: "Result of function invocation",
    method: req.method + " " + req.originalUrl,
    query: JSON.stringify(req.query),
    duration: res.locals.result.durationSeconds,
    result: JSON.stringify(res.locals.result.result, undefined, 3),
  });
  res.send(html);
}

export function debugErrorHandlingMiddelware(
  err: Error,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  res.appendHeader("content-type", "text/html");
  const html = errorResultTemplate({
    title: "Runtime error in Node.js",
    method: req.method + " " + req.originalUrl,
    query: JSON.stringify(req.query),
    message: err.message,
    error: err.toString(),
  });
  res.statusCode = 500;
  res.statusMessage = err.message;
  res.send(html);
}

const methods = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "OPTIONS",
  "HEAD",
  "CONNECT",
  "PATCH",
] as const;

export type HttpMethod = (typeof methods)[number];
export type FunctionTakingQueryAndReturnPromise = (
  q: Record<string, never> | qs.ParsedQs
) => Promise<any>;

export function addDebugEndpoint<F extends FunctionTakingQueryAndReturnPromise>(
  app: express.Express,
  method: HttpMethod,
  path: string,
  querySchema: ZodObject<any, any> | undefined,
  functionToExecute: F
) {
  const middlewares = [
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // If the functin throws the duration wrapper will also throw
      try {
        const { durationSeconds, result } = await durationWrapper(
          dayjs(), // Now. Used for duration calc
          functionToExecute,
          [req.query]
        );
        // Send result
        res.locals.result = {
          success: true,
          durationSeconds,
          result,
        };
        next();
      } catch (e: any) {
        next(e);
      }
    },
    debugErrorHandlingMiddelware,
    debugHtmlRenderMiddleware,
  ] as any[];
  if (querySchema)
    middlewares.unshift(getZodQueryValidationMiddleware(querySchema));

  switch (method) {
    case "GET":
      app.get(path, ...middlewares);
      break;
    case "POST":
      app.post(path, ...middlewares);
      break;
    case "OPTIONS":
      app.options(path, ...middlewares);
      break;
    case "PUT":
      app.put(path, ...middlewares);
      break;
    case "HEAD":
      app.head(path, ...middlewares);
      break;
    case "DELETE":
      app.delete(path, ...middlewares);
      break;
    case "PATCH":
      app.patch(path, ...middlewares);
      break;
    case "CONNECT":
      app.connect(path, ...middlewares);
      break;
    default:
      throw new Error(`HTTP method ${method} does not exist`);
  }
}

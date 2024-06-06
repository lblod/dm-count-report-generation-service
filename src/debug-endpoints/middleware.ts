import express, { RequestHandler } from "express";
import { z, ZodSchema } from "zod";
import { fromError } from "zod-validation-error";
import fs from "node:fs";
import Handlebars from "handlebars";
import { duration } from "../util/util.js";
import { logger } from "../logger.js";

// Load templates

const debugResultTemplate = compileSparql(
  fs.readFileSync("./templates/debug-output.hbs", { encoding: "utf-8" })
);
const errorResultTemplate = compileSparql(
  fs.readFileSync("./templates/error-output.hbs", { encoding: "utf-8" })
);

/**
 * Function to generate express middleware that validates the query parameters according to a zod schema
 * Invalid query parameters will cause express to continue with error handling middleware
 * @param querySchema Zod schema with which to validate the query parameters
 * @returns an express middleware which validates the query parameters
 */
export function getZodQueryValidationMiddleware(
  querySchema: ZodSchema<any, any>
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
        error: `${parse.error}\n${parse.error.stack}`,
      });
      res.statusCode = 500;
      res.statusMessage = "Validation error for query";
      res.send(html);
      return;
    }
    req.query = parse.data;
    next();
  };
}

/**
 * Express middleware that shows a function result in a readable way for debugging
 * @param req
 * @param res
 */
export function debugHtmlRenderMiddleware(
  req: express.Request,
  res: express.Response
) {
  // When the result is an object then we send the JSON strinified version and set the preformatted flag to true.
  const result = res.locals.result.result;
  const preformatted = typeof result === "object";
  res.appendHeader("content-type", "text/html");
  const html = debugResultTemplate({
    title: "Result of function invocation - Success",
    method: req.method + " " + req.originalUrl,
    query: JSON.stringify(req.query),
    duration: res.locals.result.durationMilliseconds,
    result: preformatted ? JSON.stringify(result, undefined, 3) : result,
    preformatted,
  });
  res.send(html);
}

/**
 * Express middleware that shows a function error in a readable way for debugging
 * @param req
 * @param res
 */
export function debugErrorHandlingMiddelware(
  err: Error,
  req: express.Request,
  res: express.Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: express.NextFunction
) {
  res.appendHeader("content-type", "text/html");
  const html = errorResultTemplate({
    title: "Result of function invocation - Failure",
    method: req.method + " " + req.originalUrl,
    query: JSON.stringify(req.query),
    message: err.message,
    error: `${err}\n${err.stack}`,
  });
  res.statusCode = 500;
  res.statusMessage = `Runtime error in nodejs`;
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

function callHttpMethod(
  app: express.Express,
  path: string,
  method: string,
  middlewares: any[]
) {
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

/**
 * Shortcut to add debug functions that output HTML
 * @param app
 * @param method
 * @param path
 * @param querySchema
 * @param sendingFunction
 */
export function addDebugEndpoint(
  app: express.Express,
  method: HttpMethod,
  path: string,
  querySchema: ZodSchema<any, any>,
  sendingFunction: RequestHandler
) {
  const middlewares = [
    getZodQueryValidationMiddleware(querySchema),
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // If the function throws the duration wrapper will also throw
      try {
        await sendingFunction(req, res, next);
        next();
      } catch (e: any) {
        logger.error(e.message);
        next(e);
      }
    },
    debugErrorHandlingMiddelware,
  ] as any[];
  callHttpMethod(app, path, method, middlewares);
}

/**
 * Function that adds a debug endpoint for testing a specific function that outputs any value
 * @param app Express app
 * @param method  HTTP method
 * @param path URL path
 * @param querySchema ZOD schema to validate query parameters
 * @param functionToExecute The function to debug
 */
export function addSimpleDebugEndpoint(
  app: express.Express,
  method: HttpMethod,
  path: string,
  querySchema: ZodSchema<any, any>,
  functionToExecute: (
    query: z.infer<typeof querySchema>,
    params: undefined | Record<string, string>
  ) => Promise<any>
) {
  const middlewares = [
    getZodQueryValidationMiddleware(querySchema),
    async (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction
    ) => {
      // If the function throws the duration wrapper will also throw
      try {
        const { durationMilliseconds, result } = await duration(
          functionToExecute
        )(req.query, req.params);
        // Send result
        res.locals.result = {
          success: true,
          durationMilliseconds,
          result,
        };
        next();
      } catch (e: any) {
        logger.error(e.message);
        next(e);
      }
    },
    debugErrorHandlingMiddelware,
    debugHtmlRenderMiddleware,
  ] as any[];
  callHttpMethod(app, path, method, middlewares);
}

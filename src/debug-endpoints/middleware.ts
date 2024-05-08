import express, { RequestHandler } from "express";
import { z, ZodSchema } from "zod";
import { fromError } from "zod-validation-error";
import fs from "node:fs";
import Handlebars from "handlebars";
import { durationWrapper } from "util/util.js";
import { logger } from "logger.js";

const debugResultTemplate = Handlebars.compile(
  fs.readFileSync("./templates/debug-output.hbs", { encoding: "utf-8" })
);
const errorResultTemplate = Handlebars.compile(
  fs.readFileSync("./templates/error-output.hbs", { encoding: "utf-8" })
);
// const progressTemplate = Handlebars.compile(
//   fs.readFileSync("./templates/progress-output.hbs", { encoding: "utf-8" })
// );

/**
 * Function to make express middleware that validates the query parameters according to a zod schema
 * Invalid query parameters will cause express to continue with error handling middleware
 * @param querySchema Zod scheme with which to validate the quer parameters
 * @returns an express middleware
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
  res.appendHeader("content-type", "text/html");
  const html = debugResultTemplate({
    title: "Result of function invocation - Success",
    method: req.method + " " + req.originalUrl,
    query: JSON.stringify(req.query),
    duration: res.locals.result.durationSeconds,
    result: JSON.stringify(res.locals.result.result, undefined, 3),
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

export function addDebugEndpoint(
  app: express.Express,
  method: HttpMethod,
  path: string,
  querySchema: ZodSchema<any, any>,
  sendingFunction: RequestHandler
) {
  const middlewares = [
    getZodQueryValidationMiddleware(querySchema),
    sendingFunction,
    debugErrorHandlingMiddelware,
  ] as any[];
  callHttpMethod(app, path, method, middlewares);
}

/**
 * Function that adds a debug endpoint for testing a specific function
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
  functionToExecute: (query: z.infer<typeof querySchema>) => any
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
        const { durationSeconds, result } = await durationWrapper(
          functionToExecute,
          "info",
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
        logger.error(e.message);
        next(e);
      }
    },
    debugErrorHandlingMiddelware,
    debugHtmlRenderMiddleware,
  ] as any[];
  callHttpMethod(app, path, method, middlewares);
}

// type ProgressInvocation<R> = {
//   promise: Promise<R>;
//   name: string;
// };

// const progressInvocations = new Map<string, ProgressInvocation<any>>();

/**
 * Function that adds a debug endpoint for testing a specific function
 * @param app Express app
 * @param method  HTTP method
 * @param path URL path
 * @param querySchema ZOD schema to validate query parameters
 * @param functionToExecute The function to debug
 */
// export function addExperimentalDebugEndpoint(
//   app: express.Express,
//   method: HttpMethod,
//   path: string,
//   querySchema: ZodSchema<any, any>,
//   functionToExecute: (query: z.infer<typeof querySchema>) => any,
//   slotName: string
// ) {
//   const middlewares = [
//     getZodQueryValidationMiddleware(querySchema),
//     (
//       req: express.Request,
//       res: express.Response,
//       _next: express.NextFunction
//     ) => {
//       if (progressInvocations.has(slotName)) {
//         res
//           .status(400)
//           .send("Function slot already taken. Function already executing.");
//         return;
//       }
//       // If the function throws the duration wrapper will also throw
//       const promise = durationWrapper(
//         functionToExecute,
//         "info",
//         req.query // No type checking. The validation middleware ensure that this works out
//       );
//       progressInvocations.set(slotName, {
//         name: slotName,
//         promise,
//       });
//       res.send(
//         progressTemplate({
//           title: "Function invocation - Progress",
//           method: req.method + " " + req.originalUrl,
//           query: JSON.stringify(req.query),
//         })
//       );
//     },
//   ] as any[];

//   switch (method) {
//     case "GET":
//       app.get(path, ...middlewares);
//       break;
//     case "POST":
//       app.post(path, ...middlewares);
//       break;
//     case "OPTIONS":
//       app.options(path, ...middlewares);
//       break;
//     case "PUT":
//       app.put(path, ...middlewares);
//       break;
//     case "HEAD":
//       app.head(path, ...middlewares);
//       break;
//     case "DELETE":
//       app.delete(path, ...middlewares);
//       break;
//     case "PATCH":
//       app.patch(path, ...middlewares);
//       break;
//     case "CONNECT":
//       app.connect(path, ...middlewares);
//       break;
//     default:
//       throw new Error(`HTTP method ${method} does not exist`);
//   }
// }

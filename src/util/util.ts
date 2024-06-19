import { performance } from "perf_hooks";
import { logger } from "../logger.js";
import { LogLevel } from "../types.js";
import { config } from "../configuration.js";
import { now } from "./date-time.js";

/**
 * Uses setimeout to halt execution for 'millis' milliseconds asynchronously
 * @param millis number in mullisec
 * @returns A promise
 */
export function delay(millis: number): Promise<void> {
  if (millis === 0) return Promise.resolve();
  return new Promise<void>((res) => setTimeout(res, millis));
}

function extendError(original: any, extendMessage: string): Error {
  if (!(original instanceof Error))
    throw "This function does not support functions that throw anything other than errors.";
  const error = new Error(`${extendMessage}: ${original.message}`);
  error.stack = original.stack;
  return error;
}

export type DurationResult<R> = {
  result: R;
  durationSeconds: number;
};

/**
 * Return a wrapped version of a function which takes the same arguments as the function and returns a wrapped result. The wrapped result contains the duration the function needed to execute in seconds.
 * Intented for longer running functions (order of magnitude minutes to many hours)
 * @param wrapped A async function to be wrapped
 * @param logLevel Optional loglevel to print information about the duration with
 * @returns An async function
 */
export function longDuration<F extends (...args: any[]) => Promise<any>>(
  wrapped: F,
  logLevel: LogLevel = "debug"
): (...args: Parameters<F>) => Promise<DurationResult<Awaited<ReturnType<F>>>> {
  return async function (...args: any[]) {
    const start = now();
    logger.log(
      logLevel,
      `Function "${wrapped.name}" invoked at ${start.format()}`
    );
    try {
      const result = await wrapped(...args);
      const end = now();
      const duration = end.diff(start, "second", true);
      logger.log(
        logLevel,
        `Function "${
          wrapped.name
        }" returned successfully at ${end.format()}.\n\tDuration: ${duration} seconds.`
      );
      return {
        result,
        durationSeconds: duration,
      };
    } catch (e: unknown) {
      const end = now();
      const duration = end.diff(start, "second", true);
      throw extendError(e, `After ${duration} seconds`);
    }
  };
}

export type TimeResult<R> = {
  result: R;
  durationMilliseconds: number;
};

/**
 * Return a wrapped version of a function which takes the same arguments as the function and returns a wrapped result. The wrapped result contains the duration the function needed to execute in milliseconds
 * Intented for shorter running functions (order of magnitude seconds to minutes)
 * @param wrapped A async function to be wrapped
 * @param logLevel Optional loglevel to print information about the duration with
 * @returns An async function
 */
export function duration<F extends (...args: any) => Promise<any>>(
  wrapped: F
): (...args: Parameters<F>) => Promise<TimeResult<Awaited<ReturnType<F>>>> {
  return async function (...args) {
    const start = performance.now();
    try {
      const result = await wrapped(...args);
      const end = performance.now();
      const duration = end - start;
      return {
        result,
        durationMilliseconds: Math.round(duration),
      };
    } catch (e: unknown) {
      const end = performance.now();
      const duration = end - start;
      throw extendError(e, `After ${duration.toFixed(0)} millis`);
    }
  };
}

export type RetryResult<R> = {
  result: R;
  retries: number;
};

let defaultMaxRetries = config.env.QUERY_MAX_RETRIES;
let defaultWaitMilliseconds = config.env.QUERY_WAIT_TIME_ON_FAIL_MS;

export function setDefaultRetriesAndWaitTime(
  maxRetries: number,
  waitMilliseconds: number
) {
  defaultMaxRetries = maxRetries;
  defaultWaitMilliseconds = waitMilliseconds;
}

/**
 * Return a wrapped version of a function which takes the same arguments as the function and returns a wrapped result. The wrapped result contains the amount of retries that were necassary.
 * @param wrapped A async function to be wrapped
 * @param maxRetries
 * @param waitMilliseconds How long to wait after each retry
 * @returns An async function
 */
export function retry<F extends (...args: any[]) => Promise<any>>(
  wrapped: F,
  maxRetries: number | undefined = undefined,
  waitMilliseconds: number | undefined = undefined
): (...args: Parameters<F>) => Promise<RetryResult<Awaited<ReturnType<F>>>> {
  const defaultedMaxRetries = maxRetries ?? defaultMaxRetries;
  const defaultedWaitMilliseconds = waitMilliseconds ?? defaultWaitMilliseconds;
  return async function (...args) {
    let retries = 0;
    // While loop wil always end
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const result = await wrapped(...args);
        return {
          result,
          retries,
        };
      } catch (e) {
        if (retries < defaultedMaxRetries) {
          retries++;
          logger.warn(
            `Invocation of function "${wrapped.name}" failed on try ${retries}.`
          );
          if (defaultedWaitMilliseconds) await delay(defaultedWaitMilliseconds);
        } else {
          retries++;
          throw extendError(e, `After ${retries}`);
        }
      }
    }
  };
}

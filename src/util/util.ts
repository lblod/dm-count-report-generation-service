import dayjs from "dayjs";
import { logger } from "../logger.js";
import { LogLevel } from "../types.js";
import { performance } from "perf_hooks";

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
  const error = new Error(`${extendMessage}: ${original.message}`, {
    cause: original.cause,
  });
  error.stack = original.stack;
  return error;
}

type DurationResult<R> = {
  result: R;
  durationSeconds: number;
};

export function longDuration<F extends (...args: any[]) => Promise<any>>(
  wrapped: F,
  logLevel: LogLevel = "debug"
): (...args: Parameters<F>) => Promise<DurationResult<Awaited<ReturnType<F>>>> {
  return async function (...args: any[]) {
    const start = dayjs();
    logger.log(
      logLevel,
      `Function "${wrapped.name}" invoked at ${start.format()}`
    );
    try {
      const result = await wrapped(...args);
      const end = dayjs();
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
      const end = dayjs();
      const duration = end.diff(start, "second", true);
      throw extendError(e, `After ${duration} seconds`);
    }
  };
}

type TimeResult<R> = {
  result: R;
  durationMilliseconds: number;
};

export function duration<F extends (...args: any[]) => Promise<any>>(
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
      const end = dayjs();
      const duration = end.diff(start, "second", true);
      throw extendError(e, `After ${duration} millis`);
    }
  };
}

type RetryResult<R> = {
  result: R;
  retries: number;
};

let defaultMaxRetries = 3;
let defaultWaitMilliseconds = 1000;

export function setDefaultRetriesAndWaitTime(
  maxRetries: number,
  waitMilliseconds: number
) {
  defaultMaxRetries = maxRetries;
  defaultWaitMilliseconds = waitMilliseconds;
}

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

import dayjs from "dayjs";
import { logger } from "../logger.js";
import { LogLevel } from "../types.js";

/**
 * Measures the execution duration of the wrapped async function using dayjs diff and prints info
 * When the wrapped function throws this will make a log entry (optionally) and throw the same error with a duration attached
 * @param wrapped The wrapped function
 * @param wrappedArgs The arguments to pass to the wrapped function as an array
 * @param logLevel Optional specific log level for the duration messages. putt null if you don't want logging. Default is null
 * @param now The start time used. This is optional. It will take the current time by default.
 * @returns Promise with a return value of an object with two keys. Key 'result' with the result of the wrapped function and key 'duration' with the duration in seconds
 */
export async function durationWrapper<
  F extends (...args: any[]) => Promise<any>
>(
  wrapped: F,
  logLevel: LogLevel,
  ...wrappedArgs: Parameters<F>
): Promise<{
  result: ReturnType<F> extends Promise<infer R> ? R : ReturnType<F>;
  durationSeconds: number;
}> {
  const logm = (...args: any[]) => logger.log(logLevel, ...args);
  const start = dayjs();
  logm(`Function "${wrapped.name}" invoked at ${start.format()}`);
  try {
    const result = await wrapped(...wrappedArgs);
    const end = dayjs();
    const duration = end.diff(start, "second", true);
    logm(
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
    logm(
      `Function "${
        wrapped.name
      }" returned an error at ${end.format()}.\n\tDuration: ${duration} seconds.`
    );
    if (e instanceof Error) {
      e.message = `Original message: ${e.message}\nDuration: ${duration} seconds.`;
    }
    throw e;
  }
}

/**
 * Simple timing function. To time very long running functions use 'durationwrapper'.
 * This function does not add logs. It simply wraps a function and measures the exeuctuion duration using the system clock.
 * If the wrapped function throws this will throw. It does not contain error handling
 * @param wrapped an async Function
 * @param wrappedArgs the arguments to pass to the wrapped function
 * @returns An object with two keys 'result' and 'durationMilliseconds'.
 */
export async function timingWrapper<F extends (...args: any[]) => Promise<any>>(
  wrapped: F,
  ...wrappedArgs: Parameters<F>
): Promise<{
  result: ReturnType<F> extends Promise<infer R> ? R : ReturnType<F>;
  durationMilliseconds: number;
}> {
  const start = dayjs();
  const result = await wrapped(...wrappedArgs);
  const end = dayjs();
  return {
    result,
    durationMilliseconds: end.diff(start),
  };
}

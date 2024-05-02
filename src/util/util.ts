import { LogLevel } from "./../configuration.js";
import dayjs from "dayjs";
import logger from "./../logger.js";

/**
 * Measures the execution duration of the wrapped async function using dayjs diff and prints info
 * When the wrapped function throws this will make a log entry (optionally) and throw the same error with a duration attached
 * @param wrapped The wrapped function
 * @param wrappedArgs The arguments to pass to the wrapped function as an array
 * @param logLevel Optional specific log level for the duration messages. putt null if you don't want logging. Default is null
 * @param now The start time used. This is optional. It will take the current time by default.
 * @returns Promise with a return value of an object with two keys. Key 'result' with the result of the wrapped function and key 'duration' with the duration in seconds
 */
export async function durationWrapper<F extends (...args: any) => any>(
  wrapped: F,
  wrappedArgs: Parameters<F>,
  logLevel: LogLevel | null = null,
  now: Date | "manual" | "init" | dayjs.Dayjs = dayjs()
): Promise<{
  result: ReturnType<F>;
  durationSeconds: number;
}> {
  const logm = (message: any) => {
    if (logLevel) logger.log({ level: logLevel, message });
  };
  const defaultedStart = typeof now === "string" ? dayjs() : dayjs(now);
  logm(`Function "${wrapped.name}" invoked at ${defaultedStart.format()}`);
  try {
    const result = await wrapped(...wrappedArgs);
    const defaultedEnd = dayjs();
    const duration = defaultedEnd.diff(defaultedStart, "second", true);
    logm(
      `Function "${
        wrapped.name
      }" returned successfully at ${defaultedEnd.format()}.\n\tDuration: ${duration} seconds.`
    );
    return {
      result,
      durationSeconds: duration,
    };
  } catch (e: unknown) {
    const defaultedEnd = dayjs();
    const duration = defaultedEnd.diff(defaultedStart, "second", true);
    logm(
      `Function "${
        wrapped.name
      }" returned an error at ${defaultedEnd.format()}.\n\tDuration: ${duration} seconds.`
    );
    if (e instanceof Error) {
      e.message = `Original message: ${e.message}\nDuration: ${duration} seconds.`;
    }
    throw e;
  }
}

import { LogLevel, config } from "./configuration.js";
import dayjs from "dayjs";
import logger from "./logger.js";

/**
 * Measures the execution duration of the wrapped function using dayjs diff and prints info
 * @param now The start time
 * @param wrapped The wrapped function
 * @param wrappedArgs The arguments to pass to the wrapped function
 * @param logLevel Optional specific log level for the duration messages
 * @returns Promise with a return value of an object with two keys. Key 'result' with the result of the wrapped function and key 'duration' with the duration in seconds
 */
export async function durationWrapper<A, R>(
  now: Date | "manual" | "init" | dayjs.Dayjs,
  wrapped: (...args: A[]) => Promise<R>,
  wrappedArgs: A[] = [],
  logLevel: LogLevel | undefined = undefined
): Promise<{
  result: R;
  durationSeconds: number;
}> {
  const defaultedLogLevel = logLevel ?? config.env.LOG_LEVEL;
  const logm = (message: any) => {
    logger.log({ level: defaultedLogLevel, message });
  };
  const defaultedStart = typeof now === "string" ? dayjs() : dayjs(now);
  logm(`Job started at ${defaultedStart.format()}`);
  try {
    const result = await wrapped(...wrappedArgs);
    const defaultedEnd = dayjs();
    const duration = defaultedEnd.diff(defaultedStart, "second", true);
    logm(
      `Job finished successfully at ${defaultedEnd.format()}.\n\tDuration: ${duration} seconds.`
    );
    return {
      result,
      durationSeconds: duration,
    };
  } catch (e: any) {
    const defaultedEnd = dayjs();
    const duration = defaultedEnd.diff(defaultedStart, "second", true);
    logm(
      `Job finished with error at ${defaultedEnd.format()}.\n\tDuration: ${duration} seconds.`
    );
    throw e;
  }
}

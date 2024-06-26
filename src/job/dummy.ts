import { delay } from "../util/util.js";
import { JobFunction } from "./job.js";

/**
 * Job function simulating a long operation with many status updates. Default values apply when arguments are undefined
 * @param progress Default progress object passed to any job function
 * @param numOperations Amount of dummy operations (effectively 'delay')
 * @param operationDurationSeconds Duration of the dummy operations
 */
export const dummyFunction: JobFunction = async (
  progress,
  numOperations: number | undefined,
  operationDurationSeconds: number | undefined
) => {
  const defaultedNumOperations = numOperations ?? 60;
  const defaultedOperationDurationSeconds = operationDurationSeconds ?? 1;
  progress.update(
    `Dummy function invoked with ${defaultedNumOperations} operations. Each operation will take ${defaultedOperationDurationSeconds} seconds. Original arguments were ${numOperations} and ${operationDurationSeconds}.`
  );

  for (let i = 0; i < defaultedNumOperations; i++) {
    await delay(defaultedOperationDurationSeconds * 1_000);
    progress.progress(
      i + 1,
      defaultedNumOperations,
      defaultedOperationDurationSeconds * 1_000
    );
  }
  progress.update(
    `Dummy function finished. Approximate duration was ${
      defaultedNumOperations * defaultedOperationDurationSeconds
    } seconds.`
  );
};

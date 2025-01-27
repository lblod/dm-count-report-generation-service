import { DurationResult, longDuration } from "../util/util.js";
import { JOB_FUNCTIONS } from "./job-functions-map.js";
import { Job } from "./job.js";
import { config } from "../configuration.js";

type ExecutionInformation = {
  job: Job;
  args: any[];
  promise: Promise<DurationResult<void>> | null; // Null means not executed yet. non null value means currently executing
};

const queue: ExecutionInformation[] = [];
let current: ExecutionInformation | null = null;

/**
 * Get a list modeling the queue of tasks. No references to the actual queue.
 * @returns A data structure with information about the execution queue.
 */
export function getQueue() {
  return queue.map((info) => {
    return {
      jobUri: info.job.uri,
      uuid: info.job.uuid,
      status: info.job.status,
      executing: !!info.promise,
      function: info.job.datamonitoringFunction,
    };
  });
}

/**
 * If a job is executing this function will return a reference to it. If not it will return null.
 * @returns The current job or null
 */
export function getCurrent(): Job | null {
  return current ? current.job : null;
}

function removeFromQueue(item: ExecutionInformation) {
  // remove the element from the array
  const index = queue.indexOf(item);
  if (index === -1)
    throw new Error(
      `Impossible. Was not able to remove last element from the queue. Critical error.`
    );
  queue.splice(index, 1);
}

/**
 * Add a now to the execution queue. Return how many jobs are waiting in front of it.
 * Returns immediately
 * @param job The job to add
 * @param args The arguments passed to the job when it starts
 * @returns The amount of jobs waiting in line before this one executes. 0 means executing immediately.
 */
export function addToQueue(job: Job, ...args: any[]): number {
  const check = queue.find((i) => {
    i.job.uri === job.uri;
  });
  if (check)
    throw new Error(
      "Job has already been added to the queue and cannot be added twice."
    );
  queue.push({
    job,
    args,
    promise: null,
  });
  setTimeout(loop, 0);
  return queue.length - 1;
}

async function loop() {
  if (!queue.length) return; // Nothing in the queue. Stop.
  if (current) return; // Something is already executing. Stop.
  const last = queue[queue.length - 1];
  if (last.promise !== null) return; // Last one already executing stop. This should never happen because of the state kept in current.
  // There is a job in the queue that needs executing
  // So execute it and make it current
  current = last;
  const func = JOB_FUNCTIONS[last.job.datamonitoringFunction];
  await last.job._progress.start();
  last.promise = longDuration(func)(last.job._progress, ...last.args); // Promise !== null so it is designated as executing
  last.promise
    .then((durationResult) => {
      last.job._progress.update(
        `Job finished. Duration was ${durationResult.durationSeconds} seconds.`
      );
      last.job._progress.return(durationResult.result).then(() => {
        removeFromQueue(last);
        current = null;
        if (!queue.length) {
          if (config.env.INITIAL_SYNC) {
            console.log("All initial sync jobs have finished. Waiting for next sync.");
          }
          else{
            console.log("All jobs have finished. Waiting for next sync.");
          }
        }
        setInterval(loop, 0); // Execute next job or stop, break function stack
      });
    })
    .catch((e) => {
      // The function failed.
      last.job._progress.error(e).then(() => {
        removeFromQueue(last);
        current = null;
        if (!queue.length) {
          if (config.env.INITIAL_SYNC) {
            console.log("All initial sync jobs have finished. Waiting for next sync.");
          }
          else{
            console.log("All jobs have finished. Waiting for next sync.");
          }
        }
        setInterval(loop, 0); // Execute next job or stop, break function stack
      });
    });
}

import { DurationResult, longDuration } from "../util/util.js";
import { JOB_FUNCTIONS } from "./job-functions-map.js";
import { Job } from "./job.js";

type ExecutionInformation = {
  job: Job;
  args: any[];
  promise: Promise<DurationResult<void>> | null; // Null means not executed yet. non null value means currently executing
};

const queue: ExecutionInformation[] = [];

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
 * Add a now to the exeuctuion queue. return how many jobs are waiting in front of it.
 * Returns immediately
 * @param job
 * @param args
 * @returns
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
  if (!queue.length) return;
  const last = queue[queue.length - 1];
  // Check if there are new functions that need to be executed.
  if (last.promise !== null) return; // already executing
  // There is a job in the queue that needs executing
  // So execute it.
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
        loop();
      });
    })
    .catch((e) => {
      // The function failed.
      last.job._progress.error(e).then(() => {
        removeFromQueue(last);
        loop();
      });
    });
}

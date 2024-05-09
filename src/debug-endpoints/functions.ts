import { Request, RequestHandler, Response } from "express";
import fs from "node:fs";
import Handlebars from "handlebars";
import { PeriodicJob, RestJob, getJobs } from "../job/job.js";
import { getTasks } from "../job/task.js";
import {
  DataMonitoringFunction,
  DayOfWeek,
  JobStatus,
  JobType,
  getEnumStringFromUri,
} from "../types.js";
import { TimeOnly } from "util/date-time.js";

const showJobsTemplate = Handlebars.compile(
  fs.readFileSync("./templates/show-jobs.hbs", { encoding: "utf-8" })
);

const showTaskTemplate = Handlebars.compile(
  fs.readFileSync("./templates/task.hbs", { encoding: "utf-8" })
);

type PeriodicJobInfo = {
  timeOfInvocationInformation: string;
};

type RestJobInfo = {
  restPath: string;
};

type JobRecord<T extends JobType> = {
  uri: string;
  jobType: T;
  uuid: string;
  status: JobStatus;
  datamonitoringFunction: DataMonitoringFunction;
  information: T extends JobType.PERIODIC
    ? PeriodicJobInfo
    : T extends JobType.REST_INVOKED
    ? RestJobInfo
    : undefined;
};

function printInvocationInformation(
  timeOfInvocation: TimeOnly,
  daysOfInvocation: DayOfWeek[]
) {
  return `${timeOfInvocation.toString()} on ${daysOfInvocation
    .map((day) => getEnumStringFromUri(day, true))
    .join(", ")}`;
}

export const showJobs: RequestHandler = (_, res) => {
  const jobs = getJobs();

  const output: JobRecord<JobType>[] = [];
  for (const job of jobs) {
    switch (job.jobType) {
      case JobType.PERIODIC:
        output.push({
          uri: job.uri,
          jobType: JobType.PERIODIC,
          uuid: job.uuid,
          status: job.status,
          datamonitoringFunction: job.datamonitoringFunction,
          information: {
            timeOfInvocationInformation: printInvocationInformation(
              (job as PeriodicJob).timeOfInvocation,
              (job as PeriodicJob).daysOfInvocation
            ),
          },
        });
        break;
      case JobType.REST_INVOKED: {
        output.push({
          uri: job.uri,
          jobType: JobType.REST_INVOKED,
          uuid: job.uuid,
          status: job.status,
          datamonitoringFunction: job.datamonitoringFunction,
          information: {
            restPath: (job as RestJob)._restPath,
          },
        });
        break;
      }
      default:
        throw new Error("Impossible enum value");
    }
  }
  const html = showJobsTemplate({
    title: "Current jobs for counting service",
    jobs: output,
    periodicValue: JobType.PERIODIC,
    restValue: JobType.REST_INVOKED,
  });
  res.send(html);
};

export async function startTask(req: Request, res: Response): Promise<void> {
  if (!req.params.restPath) throw new Error("Params not present.");
  const restPath = req.params.restPath;
  const restJobs = getJobs().filter(
    (j) => j.jobType === JobType.REST_INVOKED
  ) as RestJob[];
  const job = restJobs.find((j) => j.restPath);
  if (!job)
    throw new Error(
      `No Rest job with the path found. path was "${restPath}" available. Supported paths are: ${restJobs
        .map((j) => `"${j.restPath}"`)
        .join(",")}`
    );
  // Check if a task is already running for this job
  const task = await (async () => {
    const testTask = getTasks().find((t) => t.jobUri === job.uri);
    if (!testTask) {
      // If no task is found then start it
      // Invoking should never take long
      return await job.invoke();
    }
    return testTask;
  })();
  const html = showTaskTemplate({
    title: `Task with uri ${task.uri}`,
    createdAt: task.createdAt,
    modifiedAt: task.modifiedAt,
    status: task.status,
    function: task.datamonitoringFunction,
    uuid: task.uuid,
  });
  res.send(html);
}

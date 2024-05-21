import { Request, RequestHandler, Response } from "express";
import fs from "node:fs";
import Handlebars from "handlebars";
import {
  PeriodicJobTemplate,
  RestJobTemplate,
  getJobTemplates,
} from "../job/job-template.js";
import { getJobs } from "../job/job.js";
import {
  DataMonitoringFunction,
  DayOfWeek,
  JobTemplateStatus,
  JobTemplateType,
  getEnumStringFromUri,
} from "../types.js";
import { TimeOnly } from "../util/date-time.js";
import { logger } from "../logger.js";

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

type JobRecord<T extends JobTemplateType> = {
  uri: string;
  jobType: T;
  uuid: string;
  status: JobTemplateStatus;
  datamonitoringFunction: DataMonitoringFunction;
  information: T extends JobTemplateType.PERIODIC
    ? PeriodicJobInfo
    : T extends JobTemplateType.REST_INVOKED
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
  const jobs = getJobTemplates();

  const output: JobRecord<JobTemplateType>[] = [];
  for (const job of jobs) {
    switch (job.jobTemplateType) {
      case JobTemplateType.PERIODIC:
        output.push({
          uri: job.uri,
          jobType: JobTemplateType.PERIODIC,
          uuid: job.uuid,
          status: job.status,
          datamonitoringFunction: job.datamonitoringFunction,
          information: {
            timeOfInvocationInformation: printInvocationInformation(
              (job as PeriodicJobTemplate).timeOfInvocation,
              (job as PeriodicJobTemplate).daysOfInvocation
            ),
          },
        });
        break;
      case JobTemplateType.REST_INVOKED: {
        output.push({
          uri: job.uri,
          jobType: JobTemplateType.REST_INVOKED,
          uuid: job.uuid,
          status: job.status,
          datamonitoringFunction: job.datamonitoringFunction,
          information: {
            restPath: (job as RestJobTemplate)._restPath,
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
    periodicValue: JobTemplateType.PERIODIC,
    restValue: JobTemplateType.REST_INVOKED,
  });
  res.send(html);
};

export async function startTask(req: Request, res: Response): Promise<void> {
  if (!req.params.restPath) throw new Error("Params not present.");
  const restPath = req.params.restPath;
  const restJobs = getJobTemplates().filter(
    (j) => j.jobTemplateType === JobTemplateType.REST_INVOKED
  ) as RestJobTemplate[];
  const job = restJobs.find((j) => j.restPath === restPath);
  if (!job)
    throw new Error(
      `No Rest job with the path found. path was "${restPath}" available. Supported paths are: ${restJobs
        .map((j) => `"${j.restPath}"`)
        .join(",")}`
    );
  // Check if a task is already running for this job
  const task = await (async () => {
    const testTask = getJobs().find((t) => t.jobTemplateUri === job.uri);
    if (!testTask) {
      // If no task is found then start it
      // Invoking should never take long
      logger.debug(
        `Invoking from REST path ${restPath} a job "${
          job.uri
        }" with datamonitoring function ${getEnumStringFromUri(
          job.datamonitoringFunction,
          false
        )}. `
      );
      return await job.invoke();
    }
    return testTask;
  })();
  // invoke returns fast. Actual task is running in the background

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

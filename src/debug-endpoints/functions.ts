import { NextFunction, Request, RequestHandler, Response } from "express";
import fs from "node:fs";
import Handlebars from "handlebars";
import {
  PeriodicJobTemplate,
  RestJobTemplate,
  getJobTemplates,
} from "../job/job-template.js";
import {
  DataMonitoringFunction,
  DayOfWeek,
  JobTemplateStatus,
  JobTemplateType,
  getEnumStringFromUri,
} from "../types.js";
import { TimeOnly } from "../util/date-time.js";
import { getQueue } from "../job/execution-queue.js";
import { getJobs } from "../job/job.js";

// Load templates and parse them

const showJobTemplatesTemplate = Handlebars.compile(
  fs.readFileSync("./templates/show-job-templates.hbs", { encoding: "utf-8" })
);

const showQueueTemplate = Handlebars.compile(
  fs.readFileSync("./templates/queue.hbs", { encoding: "utf-8" })
);

const showJobTemplate = Handlebars.compile(
  fs.readFileSync("./templates/job.hbs", { encoding: "utf-8" })
);

type PeriodicJobTemplateInfo = {
  timeOfInvocationInformation: string;
};

type RestJobTemplateInfo = {
  urlPath: string;
};

type JobTemplateRecord<T extends JobTemplateType> = {
  uri: string;
  jobTemplateType: T;
  uuid: string;
  status: JobTemplateStatus;
  datamonitoringFunction: DataMonitoringFunction;
  information: T extends JobTemplateType.PERIODIC
    ? PeriodicJobTemplateInfo
    : T extends JobTemplateType.REST_INVOKED
    ? RestJobTemplateInfo
    : undefined;
};

/**
 * Helper function for debugging. Might make this a handlebars helper.
 * @param timeOfInvocation
 * @param daysOfInvocation
 * @returns A nicely formatted string
 */
function printInvocationInformation(
  timeOfInvocation: TimeOnly,
  daysOfInvocation: DayOfWeek[]
) {
  return `${timeOfInvocation.toString()} on ${daysOfInvocation
    .map((day) => getEnumStringFromUri(day, true))
    .join(", ")}`;
}

/**
 * Request hangler to show a page with all job templates.
 */
export const showJobTemplates: RequestHandler = (_, res) => {
  const output: JobTemplateRecord<JobTemplateType>[] = [];
  for (const jobTemplate of getJobTemplates()) {
    switch (jobTemplate.jobTemplateType) {
      case JobTemplateType.PERIODIC:
        output.push({
          uri: jobTemplate.uri,
          jobTemplateType: JobTemplateType.PERIODIC,
          uuid: jobTemplate.uuid,
          status: jobTemplate.status,
          datamonitoringFunction: jobTemplate.datamonitoringFunction,
          information: {
            timeOfInvocationInformation: printInvocationInformation(
              (jobTemplate as PeriodicJobTemplate).timeOfInvocation,
              (jobTemplate as PeriodicJobTemplate).daysOfInvocation
            ),
          },
        });
        break;
      case JobTemplateType.REST_INVOKED: {
        output.push({
          uri: jobTemplate.uri,
          jobTemplateType: JobTemplateType.REST_INVOKED,
          uuid: jobTemplate.uuid,
          status: jobTemplate.status,
          datamonitoringFunction: jobTemplate.datamonitoringFunction,
          information: {
            urlPath: (jobTemplate as RestJobTemplate)._urlPath,
          },
        });
        break;
      }
      default:
        throw new Error("Impossible enum value");
    }
  }
  const html = showJobTemplatesTemplate({
    title: "Current Job templates for counting service",
    jobTemplates: output,
    periodicValue: JobTemplateType.PERIODIC,
    restValue: JobTemplateType.REST_INVOKED,
  });
  res.send(html);
};

/**
 * Requesthandler to show a page showing the execution queue.
 */
export async function showQueue(
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const queue = getQueue();
  const html = showQueueTemplate({
    title: "Current jobs in queue",
    queue,
  });
  res.send(html);
}

/**
 * Request handler showing a page which shows the progress of a specific task
 */
export async function showProgress(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const uuid = req.params.uuid;
  if (!uuid) {
    const e = new Error(
      `UUID URL parameter not present. Correct URL looks like /progress/<uuid>. Got "${req.params.uuid}"`
    );
    next(e);
    return;
  }
  const job = getJobs().find((j) => j.uuid === uuid);
  if (!job) {
    const e = new Error(`Job with uuid "${uuid}" does not exist`);
    next(e);
    return;
  }

  const html = showJobTemplate({
    title: `Progress of job ${job.uri}`,
    createdAt: job.createdAt,
    modifiedAt: job.modifiedAt,
    status: job.status,
    function: job.datamonitoringFunction,
    done: job.progressDone ?? 0,
    total: job.progressTotal ?? 0,
    log: job.logsAsStrings(),
    uuid: job.uuid,
  });

  res.send(html);
}

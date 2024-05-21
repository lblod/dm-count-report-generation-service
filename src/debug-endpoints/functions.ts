import { NextFunction, Request, RequestHandler, Response } from "express";
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

const showJobTemplatesTemplate = Handlebars.compile(
  fs.readFileSync("./templates/show-jobs.hbs", { encoding: "utf-8" })
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

function printInvocationInformation(
  timeOfInvocation: TimeOnly,
  daysOfInvocation: DayOfWeek[]
) {
  return `${timeOfInvocation.toString()} on ${daysOfInvocation
    .map((day) => getEnumStringFromUri(day, true))
    .join(", ")}`;
}

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
    title: "Current jobs for counting service",
    jobs: output,
    periodicValue: JobTemplateType.PERIODIC,
    restValue: JobTemplateType.REST_INVOKED,
  });
  res.send(html);
};

export async function startRestJob(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.params.urlPath) throw new Error("Params not present.");
  const urlPath = req.params.urlPath;
  const restJobs = getJobTemplates().filter(
    (j) => j.jobTemplateType === JobTemplateType.REST_INVOKED
  ) as RestJobTemplate[];
  const restJobTemplate = restJobs.find((j) => j.urlPath === urlPath);
  if (!restJobTemplate) {
    const e = new Error(
      `No Rest job with the path found. path was "${urlPath}" available. Supported paths are: ${restJobs
        .map((j) => `"${j.urlPath}"`)
        .join(",")}`
    );
    next(e);
    return;
  }

  // Check if a job is already running for this jobtemplate
  const job = await (async () => {
    const testJob = getJobs().find(
      (t) => t.jobTemplateUri === restJobTemplate.uri
    );
    if (!testJob) {
      // If no task is found then start it
      // Invoking should never take long
      logger.debug(
        `Invoking from REST path ${urlPath} a job "${
          restJobTemplate.uri
        }" with datamonitoring function ${getEnumStringFromUri(
          restJobTemplate.datamonitoringFunction,
          false
        )}. `
      );
      return await restJobTemplate.invoke(); // If not exists invoke a new one
    }
    return testJob; // If exists return the existing one
  })();

  const html = showJobTemplate({
    title: `Job with uri ${job.uri}`,
    createdAt: job.createdAt,
    modifiedAt: job.modifiedAt,
    status: job.status,
    function: job.datamonitoringFunction,
    uuid: job.uuid,
  });
  res.send(html);
}

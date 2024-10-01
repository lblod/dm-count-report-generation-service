import { generateReportsDaily as countResourcesJobFunction } from "../job-functions/generate-count-report-daily/index.js";
import { generateReportsDaily as checkSessionJobFunction } from "../job-functions/generate-session-complete-report-daily/index.js";
import { DataMonitoringFunction } from "../types.js";
import { dummyFunction } from "./dummy.js";
import { getHarvestingTimestampDaily } from "../job-functions/generate-last-harvest-timestamp-report-daily/index.js";
import { JobFunction } from "./job.js";
import { getMaturityLevelDaily } from "../job-functions/generate-maturity-level-daily/index.js";

// Effectively an index of some kind. Maps the enum values of DataMonitoringFunction to the data monitoring functions of type 'JobFunction'.
export const JOB_FUNCTIONS: Record<DataMonitoringFunction, JobFunction> = {
  [DataMonitoringFunction.COUNT_RESOURCES]: countResourcesJobFunction,
  [DataMonitoringFunction.CHECK_SESSION_COMPLETENESS]: checkSessionJobFunction,
  [DataMonitoringFunction.CHECK_HARVESTING_EXECUTION_TIME]:
    getHarvestingTimestampDaily,
  [DataMonitoringFunction.DUMMY]: dummyFunction,
  [DataMonitoringFunction.CHECK_MATURITY_LEVEL]: getMaturityLevelDaily,
} as const;

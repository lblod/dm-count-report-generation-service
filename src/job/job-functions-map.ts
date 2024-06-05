import { DataMonitoringFunction } from "../types.js";
import { dummyFunction } from "./dummy.js";
import { generateReportsDaily } from "./generate-reports-daily.js";
import { getHarvestingTimestampDaily } from "./harvesting-timestamp-daily.js";
import { JobFunction } from "./job.js";

// Effectively an index of some kind. Maps the enum values of DataMonitoringFunction to the data monitoring functions of type 'JobFunction'.
export const JOB_FUNCTIONS: Record<DataMonitoringFunction, JobFunction> = {
  [DataMonitoringFunction.COUNT_RESOURCES]: generateReportsDaily,
  [DataMonitoringFunction.CHECK_HARVESTING_EXECUTION_TIME]:
    getHarvestingTimestampDaily,
  [DataMonitoringFunction.DUMMY]: dummyFunction,
} as const;

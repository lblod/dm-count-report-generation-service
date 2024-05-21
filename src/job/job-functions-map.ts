import { DataMonitoringFunction } from "../types.js";
import { generateReportsDaily } from "./generate-reports-daily.js";
import { getHarvestingTimestampDaily } from "./harvesting-timestamp-daily.js";
import { JobFunction } from "./job.js";

export const JOB_FUNCTIONS: Record<DataMonitoringFunction, JobFunction> = {
  [DataMonitoringFunction.COUNT_RESOURCES]: generateReportsDaily,
  [DataMonitoringFunction.CHECK_HARVESTING_EXECUTION_TIME]:
    getHarvestingTimestampDaily,
} as const;

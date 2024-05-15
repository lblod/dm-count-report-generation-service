import { DataMonitoringFunction } from "../types.js";
import { TaskFunction } from "./task.js";
import { generateReportsDaily } from "./generate-reports-daily.js";
import { getHarvestingTimestampDaily } from "./harvesting-timestamp-daily.js";

export const TASK_FUNCTIONS: Record<DataMonitoringFunction, TaskFunction> = {
  [DataMonitoringFunction.GENERATE_REPORTS]: generateReportsDaily,
  [DataMonitoringFunction.CHECK_HARVESTING_EXECUTION_TIME]:
    getHarvestingTimestampDaily,
} as const;

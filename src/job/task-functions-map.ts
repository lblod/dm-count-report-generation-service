import { DataMonitoringFunction } from "../types.js";
import { TaskFunction } from "./task.js";
import { generateReportsDaily } from "./generate-reports-daily.js";

export const TASK_FUNCTIONS: Record<DataMonitoringFunction, TaskFunction> = {
  [DataMonitoringFunction.GENERATE_REPORTS]: generateReportsDaily,
} as const;

import { PeriodicJobTemplate, getJobTemplates } from "../job/job-template.js";
import cron from "node-cron";
import { JobTemplateType } from "../types.js";
import { DateOnly, inHalfOpenInterval, now } from "../util/date-time.js";

//This module is basically a minute clock. Each minute check if an periodic task is needed to be triggered
export function initCron() {
  cron.schedule("* * * * *", () => {
    const start = now();
    start.set("s", 0); // Cron is guaranteerd not to trigger before the moment.
    start.set("ms", 0);
    const end = start.add(1, "minute");
    // Start is now at the exact minute 0 of the hour; end is one minute after that

    const periodic = getJobTemplates().filter(
      (j) => j.jobTemplateType === JobTemplateType.PERIODIC
    ) as PeriodicJobTemplate[];
    for (const jobTemplate of periodic) {
      const invocationTimeToday = jobTemplate.timeOfInvocation.toDayJs(
        DateOnly.today()
      ); // Default value is 00:00+02:00 DD/MM/YYYY
      if (
        jobTemplate.daysOfInvocation.includes(DateOnly.todayDayOfWeek()) && // If this day is in the list of invocation days
        inHalfOpenInterval(invocationTimeToday, start, end) // If this moment is within the time window around the invocation time
      ) {
        // Invoke the job
        jobTemplate.invoke(DateOnly.today()); // No await we do nothing with the promise. The job template manages execution. This function returns immediately.
      }
    }
  });
}

import { PeriodicJob, getJobs } from "../job/job.js";
import cron from "node-cron";
import { JobType } from "../types.js";
import { DateOnly, inHalfOpenInterval, now } from "../util/date-time.js";

//This module is basically a minute clock. Each minute check if an periodic task is needed to be triggered
export function initCron() {
  cron.schedule("* * * * *", () => {
    const start = now();
    start.set("s", 0); // Cron is guaranteerd not to trigger before the moment.
    start.set("ms", 0);
    const end = start.add(1, "m");
    // Start is now at the exact minute 0 of the hour; end is one minute after that

    const periodic = getJobs().filter((j) => j.jobType === JobType.PERIODIC);
    for (const job of periodic) {
      const invocationTimeToday = (job as PeriodicJob).timeOfInvocation.toDayJs(
        DateOnly.today()
      ); // Default value is 00:00+02:00 DD/MM/YYYY
      if (
        (job as PeriodicJob).daysOfInvocation.includes(
          DateOnly.todayDayOfWeek()
        ) &&
        inHalfOpenInterval(invocationTimeToday, start, end)
      ) {
        // Invoke the job
        (job as PeriodicJob).invoke(DateOnly.today()); // No await
      }
    }
  });
}

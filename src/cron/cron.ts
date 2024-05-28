import { PeriodicJobTemplate, getJobTemplates } from "../job/job-template.js";
import cron from "node-cron";
import { JobTemplateType } from "../types.js";
import { DateOnly, inHalfOpenInterval, now } from "../util/date-time.js";

/**
 * This module is basically a minute clock. Each minute check if an periodic job template is triggered
 * The reason why I don't use cron directly is because of uncertainty about time zones.
 * When a periodic job template is triggered a job is created from it.
 */

/**
 * Start the cron mechanism which automatically invokes the periodic job templates.
 */
export function initCron() {
  cron.schedule("* * * * *", async () => {
    // Cron is guaranteerd not to trigger before the moment but a little bit after. We rest the start
    const start = now().set("s", 0).set("ms", 0);
    const end = start.add(1, "minute");
    const today = DateOnly.today();
    // Start is now at the exact minute 0 of the hour; end is one minute after that

    // Possibly we might add a 'priority' in the future. Now it just fills the job queue in the order the periodic job templates are found. Therefore the periodic job templates which are found first gets executed first.
    const periodic = getJobTemplates().filter(
      (j) => j.jobTemplateType === JobTemplateType.PERIODIC
    ) as PeriodicJobTemplate[];

    for (const jobTemplate of periodic) {
      const invocationTimeToday =
        jobTemplate.timeOfInvocation.toDateTime(today); // Default value is 00:00+02:00 DD/MM/YYYY
      if (
        jobTemplate.daysOfInvocation.includes(DateOnly.todayDayOfWeek()) && // If this day is in the list of invocation days for the given template
        inHalfOpenInterval(invocationTimeToday, start, end) // If this moment is within the time window of this minute
      ) {
        await jobTemplate.invoke(); // This returns after status is written; not when the job finishes.
      }
    }
  });
}

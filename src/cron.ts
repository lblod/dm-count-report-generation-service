import dayjs from "dayjs";

export async function durationWrapper<A,R>(
  now: Date | "manual" | "init" | dayjs.Dayjs,
  wrapped:(...args: A[])=>Promise<R>,
  wrappedArgs: A[] = [],
):Promise<{
  result: R,
  durationSeconds: number,
}> {
  console.log('Automatic invocation of scheduled job')
  const defaultedStart = typeof now === 'string' ? dayjs() : dayjs(now);
  console.log(`Job started at ${defaultedStart}`);
  try {
    const result = await wrapped(...wrappedArgs);
    const defaultedEnd = dayjs();
    const duration = defaultedEnd.diff(defaultedStart,'second',true);
    console.log(`Job finished successfully at ${defaultedEnd}. Duration: ${duration} seconds.`)
    return {
      result,
      durationSeconds: duration,
    };
  } catch (e: any) {
    const defaultedEnd = dayjs();
    const duration = defaultedEnd.diff(defaultedStart,'second',true);
    console.log(`Job finished wit herror at ${defaultedEnd}. Duration: ${duration} seconds.`)
    throw e;
  }
}

import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { DEFAULT_TIMEZONE } from "../local-constants.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { date, z } from "zod";
import { DayOfWeek } from "../types.js";
dayjs.extend(utc);
dayjs.extend(timezone);

export type DateTime = dayjs.Dayjs;

/**
 * The current time as a timestamp in the local timezone
 * @returns DateTime (actually dayjs)
 */
export function now(): DateTime {
  return dayjs().tz(DEFAULT_TIMEZONE);
}

export const DATE_ISO_REGEX = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

// 00:00
export const TIME_SHORT_REGEX = /^(\d{1,2}):(\d{1,2})$/;

// 00:00:00.000
export const TIME_ISO_MILLIS_REGEX =
  /^(\d{1,2}):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/;

// 00:00:00+00:00
export const TIME_ISO_TIMEZONE_REGEX =
  /^(\d{1,2}):(\d{1,2}):(\d{1,2})[+-](\d{1,2}):(\d{1,2})$/;

// 00:00:00.000+00:00
export const TIME_ISO_MILLIS_TIMEZONE_REGEX =
  /^(\d{1,2}):(\d{1,2}):(\d{1,2})\.(\d{1,3})[+-](\d{1,2}):(\d{1,2})$/;

export const ALL_TIME_REGEXES = [
  TIME_SHORT_REGEX,
  TIME_ISO_MILLIS_REGEX,
  TIME_ISO_TIMEZONE_REGEX,
  TIME_ISO_MILLIS_TIMEZONE_REGEX,
] as const;
export const TIME_ANY_NOTATION_REGEX = RegExp(
  ALL_TIME_REGEXES.map((r) => `(?:${r.source})`).join(`|`)
);

const zeroPad = (num: number, places: number): string =>
  String(num).padStart(places, "0");

export const utcOffset = now().utcOffset();
export const utcOffsetHours =
  utcOffset < 0
    ? -Math.abs(Math.floor(utcOffset / 60))
    : Math.abs(Math.floor(utcOffset / 60));
export const utcOffsetMinutes = Math.abs(utcOffset) % 60;
export const utcOffsetString =
  utcOffset < 0
    ? `-${zeroPad(utcOffsetHours, 2)}:${zeroPad(utcOffsetMinutes, 2)}`
    : `+${zeroPad(utcOffsetHours, 2)}:${zeroPad(utcOffsetMinutes, 2)}`;

const dayOfWeekMap = [
  DayOfWeek.SUNDAY, // In Dayjs, sunday is 0
  DayOfWeek.MONDAY,
  DayOfWeek.TUESDAY,
  DayOfWeek.WEDNESDAY,
  DayOfWeek.THURSDAY,
  DayOfWeek.FRIDAY,
  DayOfWeek.SATURDAY,
];

const dateSchema = z.object({
  day: z.number().int().min(0).max(31),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(1900).max(9999),
});

/**
 * This immutable class models a date and a date only. This is NOT a timestamp.
 * A date only can be used to model something like a birthday. But the acutual exact time where your birthday starts will depend on the time zone.
 * Most days have 24 hours. Some days have 23 and other 25 depending if a daylight savings time change has occurred or not.
 * This report revices considers 'days' a lot. And using date or dayjs object to model them is messy. Because of this this class was written
 * It uses Dayjs under the hood.
 * WARNING: Dayjs month nr's are zero based (january id 0) and in this case the objects are one based (january is 1)
 */
export class DateOnly {
  private _year: number;
  get year() {
    return this._year;
  }
  private _month: number; // January is 1
  get month() {
    return this._month;
  }
  private _day: number;
  get day() {
    return this._day;
  }
  private _localStartOfDay: Dayjs;
  get localStartOfDay() {
    return this._localStartOfDay;
  }
  private _localEndOfDay: Dayjs;
  get localEndOfDay() {
    return this._localEndOfDay;
  }

  /**
   * Construct a DateOnly using a string or a sequence of three numbers.
   * You can pass a single string in the format "YYYY-MM-DD"
   * Or you can pass three numbers: year, month, day of month
   * Months for this object are one based, as is most common in writing. Dayjs uses zero based months zo be careful.
   * @param {[number,number,number,number] | [string] } args  Two possible options exist
   */
  constructor(...args: any[]) {
    this._localStartOfDay = (() => {
      if (args.length === 1 && typeof args[0] === "string") {
        const match = args[0].match(DATE_ISO_REGEX);
        if (!match)
          throw new Error(
            `When constructing an DateOnly object using a string the string must be in the ISO date format YYYY-MM-DD. Received "${args[0]}".`
          );
        const year = parseInt(match[1])!;
        const month = parseInt(match[2])!;
        const day = parseInt(match[3])!;
        dateSchema.parse({ year, month, day });
        return dayjs()
          .tz(DEFAULT_TIMEZONE, true)
          .set("year", year)
          .set("month", month - 1)
          .set("D", day)
          .set("h", 0)
          .set("m", 0)
          .set("s", 0)
          .set("ms", 0);
      } else if (args.length === 1 && dayjs.isDayjs(args[0])) {
        return args[0]
          .tz(DEFAULT_TIMEZONE, true)
          .set("h", 0)
          .set("m", 0)
          .set("s", 0)
          .set("ms", 0);
      } else if (
        args.length === 3 &&
        typeof args[0] === "number" &&
        typeof args[1] === "number" &&
        typeof args[2] === "number"
      ) {
        this._year = args[0];
        this._month = args[1];
        this._day = args[2];
        return dayjs()
          .tz(DEFAULT_TIMEZONE, true)
          .set("year", args[0])
          .set("month", args[1] - 1)
          .set("D", args[2])
          .set("h", 0)
          .set("m", 0)
          .set("s", 0)
          .set("ms", 0);
      } else {
        throw new Error(
          `Wrong number or type of arguments passed to the DateOnly class constructor. It acceither either a string (ISO date) or a three numbers (year,month,day)`
        );
      }
    })();
    this._year = this.localStartOfDay.get("year");
    this._month = this.localStartOfDay.get("month") + 1; // Dayjs months are 0 based
    this._day = this.localStartOfDay.get("D");
    this._localEndOfDay = this._localStartOfDay.add(1, "day");
  }

  // ISO compatible toString method
  toString(): string {
    return `${this._year}-${zeroPad(this._month, 2)}-${zeroPad(this._day, 2)}`;
  }

  /**
   * Useful to print the value into SPARQL queries and turtle.
   * @param fullDataTypeUri true to print full URI of data type. To be used in queries with no prefixes. Default value is false and then the prefixed notation (xsd) is used.
   * @returns a string
   */
  toDateRdfLiteral(fullDataTypeUri = false): string {
    return fullDataTypeUri
      ? `"${this.toString()}"^^<http://www.w3.org/2001/XMLSchema#date>`
      : `"${this.toString()}"^^xsd:date`;
  }

  /**
   * Combine with a TimeOnly to create a DateTime (dayjs) instance.
   * @param time
   * @returns a DateTime (actually Dayjs)
   */
  toDateTime(time: TimeOnly) {
    return dayjs()
      .tz(DEFAULT_TIMEZONE)
      .set("year", this.year)
      .set("month", this.month - 1)
      .set("day", this.day)
      .set("h", time.hour)
      .set("m", time.minute)
      .set("s", time.second)
      .set("ms", time.millisecond);
  }

  /**
   *
   * @returns A dateonly describing today (in the current timezone)
   */
  static today(): DateOnly {
    return new DateOnly(now());
  }

  /**
   *
   * @returns A dateonly describing yesterday. Based on the current exact time in this timezone minus exactly one day.
   */
  static yesterday(): DateOnly {
    const yesterdayTs = now().add(-1, "day");
    return new DateOnly(yesterdayTs);
  }

  /**
   *
   * @returns The current day of the week.
   */
  static todayDayOfWeek(): DayOfWeek {
    return dayOfWeekMap[now().day()]!;
  }
}

const timeNumberSchema = z.object({
  h: z.number().int().min(0).max(23),
  m: z.number().int().min(0).max(59),
  s: z.number().int().min(0).max(59),
  ms: z.number().int().min(0).max(999),
  hourOffset: z.number().int().min(-12).max(14),
  minuteOffset: z.number().int().min(0).max(30),
});

/**
 * This immutable class models a time of the day and a time of the day only. This is NOT a timestamp.
 * A time only can be used to model something like a a moment every day. Unlike a DateOnly the timezone does matter in this case.
 * This report revices considers 'time' a lot. And using a javascript date object to model them is messy. Because of this this class was written
 * It uses Dayjs under the hood and its instances are immutable.
 * When converting to Dayjs in combination with a DateOnly it will output a timestamp in the default timezone.
 * When outputting an RDF literal it will use the current timezone offset (local time)
 * To construct a TimeOnly the constructor accepts either a sting of a list of 4 integers.
 * When a string it passed it can either use a shorthand notation of "HH:mm" or the full notation of "HH:mm:SS.sss"
 * In every case this time only class models a time in the current timezone.
 */
export class TimeOnly {
  private _hour: number;
  get hour() {
    return this._hour;
  }
  private _minute: number;
  get minute() {
    return this._minute;
  }
  private _second: number;
  get second() {
    return this._second;
  }
  private _millisecond: number;
  get millisecond() {
    return this._millisecond;
  }
  private _hourOffset: number;
  get hourOffset() {
    return this._hourOffset;
  }
  private _minuteOffset: number;
  get minuteOffset() {
    return this._minuteOffset;
  }
  /**
   * To construct a TimeOnly the constructor accepts either a sting of a list of 4 integers.
   * When a string it passed it can either use a shorthand notation of "HH:mm" or the full notation of "HH:mm:SS.sss" or even "HH:mm:SS.sss±[HH]:[mm]".
   * Example of short notation: "10:00" meaning 10 o clock in the current timezone
   * Example of longer notation: "11:00:10" meaning 10 seconds past eleven o'clock in the current timezone
   * Example of notation including timezone: "11:30:00.000-05:00" half past eleven o'clock in Chigago (GMT -5)
   * You can pass a list of 4 numbers as well: hours, minutes, seconds, milliseconds. In this case the time will be constructed in the current timezone.
   * @param args Some combinations are possible
   */
  constructor(...args: any[]) {
    const { h, m, s, ms, hourOffset, minuteOffset } = (() => {
      if (args.length === 1 && typeof args[0] === "string") {
        // Try long ISO
        let match = args[0].match(TIME_ISO_MILLIS_TIMEZONE_REGEX);
        if (match) {
          return {
            h: parseInt(match[1]),
            m: parseInt(match[2]),
            s: parseInt(match[3]),
            ms: Math.floor(parseFloat(`0.${match[4]}`) * 1000.0),
            hourOffset: parseInt(match[5]),
            minuteOffset: parseInt(match[6]),
          };
        }
        // Try shorter ISO
        match = args[0].match(TIME_ISO_TIMEZONE_REGEX);
        if (match) {
          return {
            h: parseInt(match[1]),
            m: parseInt(match[2]),
            s: parseInt(match[3]),
            ms: 0,
            hourOffset: parseInt(match[4]),
            minuteOffset: parseInt(match[5]),
          };
        }
        match = args[0].match(TIME_ISO_MILLIS_REGEX);
        if (match) {
          return {
            h: parseInt(match[1]),
            m: parseInt(match[2]),
            s: parseInt(match[3]),
            ms: Math.floor(parseFloat(`0.${match[4]}`) * 1000),
            hourOffset: utcOffsetHours,
            minuteOffset: utcOffsetMinutes,
          };
        }
        match = args[0].match(TIME_SHORT_REGEX);
        if (match) {
          return {
            h: parseInt(match[1]),
            m: parseInt(match[2]),
            s: 0,
            ms: 0,
            hourOffset: utcOffsetHours,
            minuteOffset: utcOffsetMinutes,
          };
        }
        throw new Error(`String ${args[0]} could not be parsed.`);
      } else if (
        args.length === 4 &&
        typeof args[0] === "number" &&
        typeof args[1] === "number" &&
        typeof args[2] === "number" &&
        typeof args[3] === "number"
      ) {
        return timeNumberSchema.parse({
          h: args[0],
          m: args[1],
          s: args[2],
          ms: args[3],
          hourOffset: utcOffsetHours,
          minuteOffset: utcOffsetMinutes,
        });
      }
      throw new Error(
        `Time only constructor either takes a string or a list of 4 numbers as an argument`
      );
    })();
    this._hour = h;
    this._minute = m;
    this._second = s;
    this._millisecond = ms;
    this._hourOffset = hourOffset;
    this._minuteOffset = minuteOffset;
  }

  /**
   *
   * @returns String representation in the current timezone. Looks like "HH:mm:SS.sss"
   */
  toLocalTimezoneString(): string {
    return `${zeroPad(this.hour, 2)}:${zeroPad(this.minute, 2)}:${zeroPad(
      this.second,
      2
    )}.${zeroPad(this.millisecond, 3)}`;
  }

  /**
   *
   * @returns A human readable time string useful for printing to logs and HTML
   */
  toString(): string {
    return `${this.toLocalTimezoneString()}${
      this.hourOffset < 0 ? "-" : "+"
    }${zeroPad(Math.abs(this.hourOffset), 2)}:${zeroPad(this.minuteOffset, 2)}`;
  }

  /**
   * Useful to print the value into SPARQL queries and turtle.
   * @param fullDataTypeUri true to print full URI of data type. To be used in queries with no prefixes. Default value is false and then the prefixed notation (xsd) is used which is easier to read.
   * @returns a string
   */
  toTimeRdfLiteral(fullDataTypeUri = false): string {
    return fullDataTypeUri
      ? `"${this.toString()}"^^<http://www.w3.org/2001/XMLSchema#time>`
      : `"${this.toString()}"^^xsd:time`;
  }

  /**
   * Combine with a DateOnly to create a DateTime (dayjs) instance.
   * @param day
   * @returns a DateTime (actually Dayjs)
   */
  toDateTime(day: DateOnly) {
    return dayjs()
      .tz(DEFAULT_TIMEZONE)
      .set("year", day.year)
      .set("month", day.month - 1)
      .set("D", day.day)
      .set("h", this.hour)
      .set("m", this.minute)
      .set("s", this.second)
      .set("ms", this.millisecond);
  }

  /**
   *
   * @returns Timeonly describing the current time as a time only. NOT a timestamp. Use this module's 'now' function to get a timestamp representing this moment in the current timezone.
   */
  static now(): TimeOnly {
    const now = dayjs().tz(DEFAULT_TIMEZONE);
    return new TimeOnly(
      now.get("hour"),
      now.get("minute"),
      now.get("second"),
      now.get("millisecond")
    );
  }
}

const bigThousand = BigInt(1000);

/**
 * Useful for comparing two DateTimes
 * @param d a DateTime
 * @returns a BigInt
 */
function toBigInt(d: DateTime) {
  return BigInt(d.unix()) * bigThousand + BigInt(d.get("millisecond"));
}

/**
 * All parameters are timestamps (DateTime)
 * @param x the value
 * @param a the left boundary of the interval, inclusive
 * @param b the right boundary of the interval, exclusive
 * @returns true or false depending if timestamp x falls in the interval [a,b[
 */
export function inHalfOpenInterval(
  x: DateTime,
  a: DateTime,
  b: DateTime
): boolean {
  const X = toBigInt(x);
  return toBigInt(a) <= X && X < toBigInt(b);
}

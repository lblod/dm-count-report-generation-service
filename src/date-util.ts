import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { DEFAULT_TIMEZONE } from "./local-constants.js";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";
import { z } from "zod";
dayjs.extend(utc);
dayjs.extend(timezone);

export const VALID_ISO_DATE_REGEX = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
// ISO time example '18:00:00.000'
export const VALID_ISO_TIME_REGEX =
  /^(\d{1,2}):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/;
export const VALID_SHORT_TIME_REGEX = /^(\d{1,2}):(\d{1,2})$/;

const zeroPad = (num: number, places: number): string =>
  String(num).padStart(places, "0");
const utcOffset = dayjs().tz(DEFAULT_TIMEZONE).utcOffset();
const utcOffsetHours = Math.abs(Math.floor(utcOffset / 60));
const utcOffsetMinutes = Math.abs(utcOffset) % 60;
const utcOffsetString =
  utcOffset < 0
    ? `-${zeroPad(utcOffsetHours, 2)}:${zeroPad(utcOffsetMinutes, 2)}}`
    : `+${zeroPad(utcOffsetHours, 2)}:${zeroPad(utcOffsetMinutes, 2)}}`;

/**
 * This immutable class models a date and a date only. This is NOT a timestamp.
 * A date only can be used to model something like a birthday. But the acutual time where your birthday starts will depend on the time zone.
 * Most days have 24 hours. Some days have 23 and other 25 depending if a daylight savings time change has occurred or not.
 * This report revices considers 'days' a lot. And using date object to model them is messy. Because of this this class was written
 * It uses Dayjs under the hood and its instances are immutable
 */
export class DateOnly {
  private _year: number;
  get year() {
    return this._year;
  }
  private _month: number;
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

  constructor(...args: any[]) {
    this._localStartOfDay = (() => {
      if (args.length === 1 && typeof args[0] === "string") {
        const match = args[0].match(VALID_ISO_DATE_REGEX);
        if (!match)
          throw new Error(
            `When constructing an DateOnly object using a string the string must be in the ISO date format YYYY-MM-DD. Received "${args[0]}".`
          );
        return dayjs()
          .tz(DEFAULT_TIMEZONE, true)
          .set("year", parseInt(match[1])!)
          .set("month", parseInt(match[2])!)
          .set("day", parseInt(match[3])!)
          .set("h", 0)
          .set("m", 0)
          .set("s", 0)
          .set("ms", 0);
      } else if (args.length === 1 && dayjs.isDayjs(args[0])) {
        return dayjs(args[0])
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
          .set("month", args[1])
          .set("day", args[2])
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
    this._month = this.localStartOfDay.get("month");
    this._day = this.localStartOfDay.get("day");
    this._localEndOfDay = this._localStartOfDay.add(1, "day");
  }

  // ISO compatible toString method
  toString(): string {
    return `${this._year}-${this._month}-${this._day}`;
  }

  toDateRdfLiteral(fullDataTypeUri = false): string {
    return fullDataTypeUri
      ? `"${this.toString()}"^^<http://www.w3.org/2001/XMLSchema#date>`
      : `"${this.toString()}"^^xsd:date`;
  }

  toDayJs(time: TimeOnly) {
    return dayjs()
      .tz(DEFAULT_TIMEZONE)
      .set("year", this.year)
      .set("month", this.month)
      .set("day", this.day)
      .set("h", time.hour)
      .set("m", time.minute)
      .set("s", time.second)
      .set("ms", time.millisecond);
  }

  static today(): DateOnly {
    return new DateOnly(dayjs());
  }

  static yesterday(): DateOnly {
    const yesterdayTs = dayjs().add(-1, "day");
    return new DateOnly(yesterdayTs);
  }
}

const timeNumberSchema = z.object({
  h: z.number().int().min(0).max(23),
  m: z.number().int().min(0).max(59),
  s: z.number().int().min(0).max(59),
  ms: z.number().int().min(0).max(999),
});

/**
 * This immutable class models a time of the day and a time of the day only. This is NOT a timestamp.
 * A time only can be used to model something like a a moment every day.
 * This report revices considers 'time' a lot. And using date object to model them is messy. Because of this this class was written
 * It uses Dayjs under the hood and its instances are immutable.
 * When converting to Dayjs in combination with a DateOnly it will output a timestamp in the default timezone.
 * When outputting an RDF literal it will use the current timezone offset (local time)
 * To construct a Time only the constructor accepts either a sting of a list of 4 integers.
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

  constructor(...args: any[]) {
    const { h, m, s, ms } = (() => {
      if (args.length === 1 && typeof args[0] === "string") {
        // Try long ISO
        const match = args[0].match(VALID_ISO_TIME_REGEX);
        if (!match) {
          const shortmatch = args[0].match(VALID_SHORT_TIME_REGEX);
          if (!shortmatch)
            throw new Error(
              `Invalid time string for TimeOnly instance: "${args[0]}"`
            );
          return {
            h: parseInt(shortmatch[1]),
            m: parseInt(shortmatch[2]),
            s: 0,
            ms: 0,
          };
        }
        return {
          h: parseInt(match[1]),
          m: parseInt(match[2]),
          s: parseInt(match[3]),
          ms: Math.floor(parseFloat(`0.${match[4]}`) * 1000.0),
        };
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
  }

  toString(): string {
    return `${zeroPad(this.hour, 2)}:${zeroPad(this.minute, 2)}:${zeroPad(
      this.second,
      2
    )}.${zeroPad(this.millisecond, 3)}`;
  }

  toLocalTimezoneString(): string {
    return `${this.toString()}${utcOffsetString}`;
  }

  toTimeRdfLiteral(fullDataTypeUri = false): string {
    return fullDataTypeUri
      ? `"${this.toLocalTimezoneString()}"^^<http://www.w3.org/2001/XMLSchema#time>`
      : `"${this.toLocalTimezoneString()}"^^xsd:time`;
  }

  toDayJs(day: DateOnly) {
    return dayjs()
      .tz(DEFAULT_TIMEZONE)
      .set("year", day.year)
      .set("month", day.month)
      .set("day", day.day)
      .set("h", this.hour)
      .set("m", this.minute)
      .set("s", this.second)
      .set("ms", this.millisecond);
  }

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

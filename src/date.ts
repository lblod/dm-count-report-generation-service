import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { DEFAULT_TIMEZONE } from './local-constants.js';
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
dayjs.extend(utc);
dayjs.extend(timezone);

export const VALID_ISO_DATE_REGEX = /^(\d{4})\-(\d{1,2})\-(\d{1,2})$/;

/**
 * This immutable class models a date and a date only. This is NOT a timestamp.
 * A date only can be used to model something like a birthday. But the acutual time where your birthday starts will depend on the time zone.
 * Most days have 24 hours. Some days have 23 and other 25 depending if a daylight savings time change has occurred or not.
 * This report revices considers 'days' a lot. And using date object to model them is messy. Because of this this class was written
 * It uses Dayjs under the hood and its instances are immutable
 */
export class DateOnly {
  private _year:  number;
  get year() {return this._year;}
  private _month: number;
  get month() {return this._month;}
  private _day: number;
  get day() {return this._day;}
  private _localStartOfDay: Dayjs;
  get localStartOfDay() {return this._localStartOfDay;}
  private _localEndOfDay: Dayjs;
  get localEndOfDay() {return this._localEndOfDay;}

  constructor(...args: any[]) {
    this._localStartOfDay = (()=>{
      if(args.length===1 && typeof args[0]==='string') {
        const match = args[0].match(VALID_ISO_DATE_REGEX);
        if (!match) throw new Error(`When constructing an DateOnly object using a string the string must be in the ISO date format YYYY-MM-DD. Received "${args[0]}".`);
        return dayjs()
          .tz(DEFAULT_TIMEZONE, true)
          .set('year',parseInt(match[1])!)
          .set('month',parseInt(match[2])!)
          .set('day',parseInt(match[3])!)
          .set('h', 0)
          .set('m', 0)
          .set('s', 0)
          .set('ms', 0);
      } else if (args.length===1 && dayjs.isDayjs(args[0])) {
        return dayjs(args[0])
          .tz(DEFAULT_TIMEZONE, true)
          .set('h', 0)
          .set('m', 0)
          .set('s', 0)
          .set('ms', 0);
      } else if (
          args.length === 3 &&
          typeof args[0] === "number" &&
          typeof args[1] === "number" &&
          typeof args[2] === "number"
        ){
        this._year = args[0];
        this._month = args[1];
        this._day = args[2];
        return dayjs()
          .tz(DEFAULT_TIMEZONE, true)
          .set('year',args[0])
          .set('month',args[1])
          .set('day',args[2])
          .set('h', 0)
          .set('m', 0)
          .set('s', 0)
          .set('ms', 0);
      } else {
        throw new Error(`Wrong number or type of arguments passed to the DateOnly class constructor. It acceither either a string (ISO date) or a three numbers (year,month,day)`)
      }
    })();
    this._year = this.localStartOfDay.get('year');
    this._month = this.localStartOfDay.get('month');
    this._day = this.localStartOfDay.get('day');
    this._localEndOfDay = this._localStartOfDay.add(1,'day');
  }

  // ISO compatible toString method
  toString():string {
    return `${this._year}-${this._month}-${this._day}`
  }

  toDateRdfLiteral(fullDataTypeUri=false):string {
    return fullDataTypeUri? `"${this.toString()}"^^<http://www.w3.org/2001/XMLSchema#:date>`:`"${this.toString()}"^^xsd:date`
  }

  static today(): DateOnly {
    return new DateOnly(dayjs());
  }

  static yesterday(): DateOnly {
    const yesterdayTs = dayjs().add(-1,'day');
    return new DateOnly(yesterdayTs);
  }

}

import dayjs from "dayjs";
import { DateOnly, TimeOnly } from "../util/date-time.js";
import Handlebars from "handlebars";

/**
 * Transforms a DateOnly object to a string. This is used in HTML templates; not in SPARQL query templates.
 */
Handlebars.registerHelper("toDateString", function (dateOnly: unknown) {
  if (!(dateOnly instanceof DateOnly))
    throw new Error(
      "toDateString only takes a DateOnly instance as an argument"
    );
  return dateOnly.toString();
});

/**
 * Transforms a DateTime object to a string. This is used in HTML templates; not in SPARQL query templates.
 */
Handlebars.registerHelper("toDateTimeString", function (dateTime: unknown) {
  if (!dayjs.isDayjs(dateTime))
    throw new Error(
      `toDateTimeString only takes a dayjs instance as an argument. Received '${dateTime}'`
    );
  return dateTime.format();
});

/**
 * Transforms a TimeOnly object to a string. This is used in HTML templates; not in SPARQL query templates.
 */
Handlebars.registerHelper("toTimeString", function (timeOnly: unknown) {
  if (!(timeOnly instanceof TimeOnly))
    throw new Error(
      "toDateString only takes a DateOnly instance as an argument"
    );
  return timeOnly.toString();
});

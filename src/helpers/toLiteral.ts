import dayjs from "dayjs";
import { DateOnly, TimeOnly } from "../util/date-time.js";
import Handlebars from "handlebars";

/**
 * Transforms a DateOnly object to a SPARQL literal value.
 */
Handlebars.registerHelper("toDateLiteral", function (dateOnly: unknown) {
  if (!(dateOnly instanceof DateOnly))
    throw new Error(
      "toDateLiteral only takes a DateOnly instance as an argument"
    );
  return dateOnly.toDateRdfLiteral();
});

/**
 * Transforms a DateTime (which is dayjs) object to a SPARQL literal value.
 */
Handlebars.registerHelper("toDateTimeLiteral", function (dateTime: unknown) {
  if (!dayjs.isDayjs(dateTime))
    throw new Error(
      `toDateTimeLiteral only takes a dayjs instance as an argument. Received '${dateTime}'`
    );
  return `"${dateTime.format()}"^^xsd:dateTime`;
});

/**
 * Transforms a TimeOnly object to a SPARQL literal value.
 */
Handlebars.registerHelper("toTimeLiteral", function (timeOnly: unknown) {
  if (!(timeOnly instanceof TimeOnly))
    throw new Error(
      "toDateLiteral only takes a DateOnly instance as an argument"
    );
  return timeOnly.toTimeRdfLiteral();
});

import dayjs from "dayjs";
import { DateOnly, TimeOnly } from "../date-util.js";
import Handlebars from "handlebars";

Handlebars.registerHelper("toDateLiteral", function (dateOnly: unknown) {
  if (!(dateOnly instanceof DateOnly))
    throw new Error(
      "toDateLiteral only takes a DateOnly instance as an argument"
    );
  return dateOnly.toDateRdfLiteral();
});

Handlebars.registerHelper("toDateTimeLiteral", function (dateTime: unknown) {
  if (!dayjs.isDayjs(dateTime))
    throw new Error(
      `toDateTimeLiteral only takes a dayjs instance as an argument. Received '${dateTime}'`
    );
  return `"${dateTime.format()}"^^xsd:dateTime`;
});

Handlebars.registerHelper("toTimeLiteral", function (timeOnly: unknown) {
  if (!(timeOnly instanceof TimeOnly))
    throw new Error(
      "toDateLiteral only takes a DateOnly instance as an argument"
    );
  return timeOnly.toTimeRdfLiteral();
});

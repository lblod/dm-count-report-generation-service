import dayjs from "dayjs";
import { DateOnly, TimeOnly } from "../date-util.js";
import Handlebars from "handlebars";

Handlebars.registerHelper("toDateString", function (dateOnly: unknown) {
  if (!(dateOnly instanceof DateOnly))
    throw new Error(
      "toDateString only takes a DateOnly instance as an argument"
    );
  return dateOnly.toString();
});

Handlebars.registerHelper("toDateTimeString", function (dateTime: unknown) {
  if (!dayjs.isDayjs(dateTime))
    throw new Error(
      `toDateTimeString only takes a dayjs instance as an argument. Received '${dateTime}'`
    );
  return dateTime.format();
});

Handlebars.registerHelper("toTimeString", function (timeOnly: unknown) {
  if (!(timeOnly instanceof TimeOnly))
    throw new Error(
      "toDateString only takes a DateOnly instance as an argument"
    );
  return timeOnly.toString();
});

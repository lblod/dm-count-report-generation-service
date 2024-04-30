import dayjs from "dayjs";
import Handlebars from "handlebars";

Handlebars.registerHelper("toDateTimeLiteral", function (dateTime: unknown) {
  if (!dayjs.isDayjs(dateTime))
    throw new Error(
      `toDateLiteral only takes a dayjs instance as an argument. Received ${dateTime}`
    );
  return `"${dateTime.format()}"^^xsd:dateTime`;
});

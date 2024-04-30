import { isDayjs } from "dayjs";
import Handlebars from "handlebars";

Handlebars.registerHelper("toDateTimeLiteral", function(dateTime: unknown) {
  if (!(isDayjs(dateTime))) throw new Error('toDateLiteral only takes a DateOnly instance as an argument');
  return `"${dateTime.format()}"^^xsd:dateTime`
});

import { TimeOnly } from "../date-util.js";
import Handlebars from "handlebars";

Handlebars.registerHelper("toTimeLiteral", function (timeOnly: unknown) {
  if (!(timeOnly instanceof TimeOnly))
    throw new Error(
      "toDateLiteral only takes a DateOnly instance as an argument"
    );
  return timeOnly.toTimeRdfLiteral();
});

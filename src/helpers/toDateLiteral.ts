import { DateOnly } from "../date-util.js";
import Handlebars from "handlebars";

Handlebars.registerHelper("toDateLiteral", function (dateOnly: unknown) {
  if (!(dateOnly instanceof DateOnly))
    throw new Error(
      "toDateLiteral only takes a DateOnly instance as an argument"
    );
  return dateOnly.toDateRdfLiteral();
});

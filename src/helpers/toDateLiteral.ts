import { DateOnly } from "date";
import Handlebars from "handlebars";

Handlebars.registerHelper("toDateLiteral", function(dateOnly: unknown) {
  if (!(dateOnly instanceof DateOnly)) throw new Error('toDateLiteral only takes a DateOnly instance as an argument');
  return arguments[0].toDateRdfLiteral();
});

import dayjs from "dayjs";
import { DateOnly, TimeOnly } from "../util/date-time.js";
import Handlebars from "handlebars";

// https://www.w3.org/TR/sparql11-query/#grammarEscapes
const escapeMapping: Record<string, string> = {
  "\n": "\\n",
  "\t": "\\t",
  "\r": "\\r",
  "\f": "\\f",
  '"': '\\"',
  "'": "\\'",
  "\\": "\\\\",
};
const FIND_BAD_CHAR_REGEX = /[\n\t\r\f\\'"]/g;
// Standard is 8-4-4-4-12 format with each char a hex character
const UUID_FORMAT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/g;

export function addHelpers(handlebars: typeof Handlebars) {
  // Takes a string. Returns the string with all illegal characters escapted. Relevant for SPARQL queries.
  handlebars.registerHelper("toStringLiteral", function (input: unknown) {
    if (typeof input !== "string")
      throw new Error(
        `'toStringLiteral' takes one parameter which must be a string. Got "${input}".`
      );
    const escaped = input.replaceAll(
      FIND_BAD_CHAR_REGEX,
      (m) => escapeMapping[m]
    );
    // Single line string using single quotes for SPARQL
    return `"${escaped}"`;
  });

  // Similar to toStringLiteral but for UUID's. Does regex check
  handlebars.registerHelper("toUuidLiteral", function (input: unknown) {
    if (typeof input !== "string")
      throw new Error(
        `'toUuidLiteral' takes one parameter which must be a string. Got "${input}".`
      );
    if (!UUID_FORMAT.test(input))
      throw new Error(`"${input}" is NOT a valid UUID.`);
    // Single line string using single quotes for SPARQL
    return `"${input}"`;
  });

  // Takes a URI string, tests it and return a sparql node like <http://full-uri.com/example#Resource>
  handlebars.registerHelper("uriToNode", function (input: unknown) {
    if (typeof input !== "string")
      throw new Error(
        `'uriToNode' takes one parameter which must be a string. Got "${input}".`
      );
    try {
      const test = new URL(input); // Fails if bad url.
      if (
        test.password !== "" ||
        test.username !== "" ||
        test.port !== "" ||
        test.search !== ""
      )
        throw ""; // To catch clause
    } catch (e) {
      throw new Error(
        `URI's are supposed to be of a specific format like: http://example.com/ns/example#Item.`
      );
    }
    return `<${input}>`;
  });

  /**
   * Transforms a DateOnly object to a SPARQL literal value.
   */
  handlebars.registerHelper("toDateLiteral", function (dateOnly: unknown) {
    if (!(dateOnly instanceof DateOnly))
      throw new Error(
        "toDateLiteral only takes a DateOnly instance as an argument"
      );
    return dateOnly.toDateRdfLiteral();
  });

  /**
   * Transforms a DateTime (which is dayjs) object to a SPARQL literal value.
   */
  handlebars.registerHelper("toDateTimeLiteral", function (dateTime: unknown) {
    if (!dayjs.isDayjs(dateTime))
      throw new Error(
        `toDateTimeLiteral only takes a dayjs instance as an argument. Received '${dateTime}'`
      );
    return `"${dateTime.format()}"^^xsd:dateTime`;
  });

  /**
   * Transforms a TimeOnly object to a SPARQL literal value.
   */
  handlebars.registerHelper("toTimeLiteral", function (timeOnly: unknown) {
    if (!(timeOnly instanceof TimeOnly))
      throw new Error(
        "toDateLiteral only takes a DateOnly instance as an argument"
      );
    return timeOnly.toTimeRdfLiteral();
  });

  /**
   * Transforms a boolean value to a SPARQL literal value.
   */
  handlebars.registerHelper("toBooleanLiteral", function (bool: unknown) {
    if (typeof bool !== "boolean")
      throw new Error(
        "toBooleanLiteral only takes a boolean primitive as an argument"
      );
    return `"${bool}"^^xsd:boolean`;
  });

  /**
   * Transforms an integer value to a SPARQL literal value.
   * Even when the value is a number this function WILL throw if it's not an exact, safe integer.
   * It does NOT round up or down automatically.
   */
  handlebars.registerHelper("toIntegerLiteral", function (integer: unknown) {
    if (typeof integer !== "number" || !Number.isSafeInteger(integer))
      throw new Error(
        "toInteger only takes a boolean primitive as an argument"
      );
    return `"${integer}"`;
  });

  /**
   * Transforms an floating point value to a SPARQL literal value.
   * Because javascript numbers are 64 bit floating point numbers the xsd:double datatype is used
   * CAREFUL! NaN (Not a number) is an acceptable value for this function.
   * When the value equals plus or minus Number.POSITIVE_INFINITY this is written as a symbol.
   */
  handlebars.registerHelper("toFloatLiteral", function (float: unknown) {
    if (typeof float !== "number")
      throw new Error(
        "toInteger only takes a boolean primitive as an argument"
      );
    if (float === Number.POSITIVE_INFINITY) return `"INF"^^xsd:double`;
    if (float === -Number.POSITIVE_INFINITY) return `"-INF"^^xsd:double`;
    if (Number.isNaN(float)) return `"NaN"^^xsd:double`;
    return `"${float}"^^xsd:double`;
  });
}

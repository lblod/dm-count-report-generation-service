import { DateOnly, TimeOnly } from "../util/date-time.js";
import Handlebars from "handlebars";
import dayjs from "dayjs";
import { config } from "../configuration.js";
import { getEnumStringFromUri } from "../types.js";
import fs from "node:fs";

// eslint-disable-next-line no-useless-escape
const PATH_REGEX = /(\/[a-z\-/0-9]*)\??([a-z\-/0-9\=&]*)/;

export function addHelpers(handlebars: typeof Handlebars) {
  /**
   * Transforms a DateOnly object to a string. This is used in HTML templates; not in SPARQL query templates.
   */
  handlebars.registerHelper("toDateString", function (dateOnly: unknown) {
    if (!(dateOnly instanceof DateOnly))
      throw new Error(
        "toDateString only takes a DateOnly instance as an argument"
      );
    return dateOnly.toString();
  });

  /**
   * Transforms a DateTime object to a string. This is used in HTML templates; not in SPARQL query templates.
   */
  handlebars.registerHelper("toDateTimeString", function (dateTime: unknown) {
    if (!dayjs.isDayjs(dateTime))
      throw new Error(
        `toDateTimeString only takes a dayjs instance as an argument. Received '${dateTime}'`
      );
    return dateTime.format();
  });

  /**
   * Transforms a TimeOnly object to a string. This is used in HTML templates; not in SPARQL query templates.
   */
  handlebars.registerHelper("toTimeString", function (timeOnly: unknown) {
    if (!(timeOnly instanceof TimeOnly))
      throw new Error(
        "toDateString only takes a DateOnly instance as an argument"
      );
    return timeOnly.toString();
  });
  // Returns a relative url ending with the path given as a parameter. "/test"=>"/rootPath/test"
  handlebars.registerHelper("rel", function (path: string) {
    if (typeof path !== "string" || !PATH_REGEX.test(path))
      throw new Error(
        `'rel' takes one parameter which must be a string describing an URL relative to the root. It needs to start with "/". Got "${path}"`
      );
    return `${config.env.ROOT_URL_PATH}${path}`;
  });

  handlebars.registerHelper("printUriEnum", function (enumValue: unknown) {
    if (!(typeof enumValue === "string"))
      throw new Error(`printUriEnum only takes a string. Got "${enumValue}"`);
    return getEnumStringFromUri(enumValue, false);
  });

  handlebars.registerPartial(
    "styling",
    "<style>\n" +
      fs.readFileSync("./templates/styling.css", { encoding: "utf-8" }) +
      "</style>\n"
  );
}

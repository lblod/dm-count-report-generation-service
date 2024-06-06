import Handlebars from "handlebars";
import { config } from "../configuration.js";

// eslint-disable-next-line no-useless-escape
const PATH_REGEX = /(\/[a-z\-/0-9]*)\??([a-z\-/0-9\=&]*)/;

// Returns true of both args are primitive (number,string,boolean) and equal
Handlebars.registerHelper(
  "eq",
  function (one: string | number, two: string | number) {
    const typeOne = typeof one;
    const typeTwo = typeof two;
    if (typeOne === "string" && typeTwo === "string") return one === two;
    if (typeOne === "number" && typeTwo === "number") return one === two;
    if (typeOne === "boolean" && typeTwo === "boolean") return one === two;
    throw new Error(
      `'eq' takes two parameters who can either be strings, booleans or numbers. They have to be the same type. Received "${one}" and "${two}".`
    );
  }
);

// Returns a relative url ending with the path given as a parameter. "/test"=>"/rootPath/test"
Handlebars.registerHelper("rel", function (path: string) {
  if (typeof path !== "string" || !PATH_REGEX.test(path))
    throw new Error(
      `'rel' takes one parameter which must be a string describing an URL relative to the root. It needs to start with "/". Got "${path}"`
    );
  return `${config.env.ROOT_URL_PATH}${path}`;
});

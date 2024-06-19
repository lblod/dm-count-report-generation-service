import Handlebars from "handlebars";

export function addHelpers(handlebars: typeof Handlebars) {
  handlebars.registerHelper("limitClause", function (limit: unknown) {
    if (!(typeof limit === "number"))
      throw new Error(
        `limitClause only takes a number as an argument. Received "${limit}"`
      );
    if (!Number.isInteger(limit) || limit < 0)
      throw new Error(
        "limitClause only takes an positive integer as an argument."
      );
    if (limit !== 0) return `LIMIT ${limit}`;
    return "";
  });
}

import Handlebars from "handlebars";

/**
 * Limit clause prints a SPARQL limit clause if the limit argument is larger than zero.
 */
Handlebars.registerHelper("limitClause", function (limit: any) {
  if (!(typeof limit === "number"))
    throw new Error("limitClause only takes a number as an argument.");
  if (!Number.isInteger(limit) || limit < 0)
    throw new Error(
      "limitClause only takes an positivie integer as an argument."
    );
  if (limit !== 0) return `LIMIT ${limit}`;
  return "";
});

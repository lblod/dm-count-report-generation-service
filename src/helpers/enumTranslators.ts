import {
  DataMonitoringFunction,
  DayOfWeek,
  JobTemplateStatus,
  JobTemplateType,
  JobStatus,
  JobType,
  getEnumStringFromUri,
} from "../types.js";
import Handlebars from "handlebars";

/**
 * The module contains the handlebar helper which convert an enum value of an enum containing URI's (either the key or the value) into the URI.
 * The rendered query will always contain the URI. The input of the helper can be an enum value.
 */

function createToSparqlLiteralHelper(
  funcName: string,
  enumObject: Record<string, string>
) {
  Handlebars.registerHelper(funcName, function (enumValue: unknown) {
    if (typeof enumValue !== "string")
      throw `${funcName} ony takes one string as an argument.`;
    for (const [key, value] of Object.entries(enumObject)) {
      if (key === enumValue) return `<${enumObject[enumValue]}>`;
      if (value === enumValue) return `<${enumValue}>`;
    }
    throw new Error(
      `${funcName} only takes one of: ${Object.values(enumObject).join(
        ","
      )} or ${Object.keys(enumObject).join(",")}. Received "${enumValue}".`
    );
  });
}

Handlebars.registerHelper("printUriEnum", function (enumValue: unknown) {
  if (!(typeof enumValue === "string"))
    throw new Error(`printUriEnum only takes a string. Got "${enumValue}"`);
  return getEnumStringFromUri(enumValue, false);
});

createToSparqlLiteralHelper("toJobStatusLiteral", JobStatus);
createToSparqlLiteralHelper("toJobTypeLiteral", JobType);
createToSparqlLiteralHelper("toJobTemplateStatusLiteral", JobTemplateStatus);
createToSparqlLiteralHelper("toJobTemplateTypeLiteral", JobTemplateType);
createToSparqlLiteralHelper("toDayOfWeekLiteral", DayOfWeek);
createToSparqlLiteralHelper(
  "toDatamonitoringFunctionLiteral",
  DataMonitoringFunction
);

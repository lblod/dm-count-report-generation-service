import {
  DataMonitoringFunction,
  DayOfWeek,
  JobStatus,
  JobType,
  TaskStatus,
  TaskType,
  getEnumStringFromUri,
} from "../types.js";
import Handlebars from "handlebars";

function createToSparqlLiteralHelper(
  funcName: string,
  enumObject: Record<string, string>
) {
  Handlebars.registerHelper(funcName, function (enumValue: unknown) {
    if (
      !(
        typeof enumValue === "string" &&
        Object.values(enumObject).includes(enumValue)
      )
    )
      throw new Error(
        `${funcName} only takes one of: ${Object.values(enumObject).join(",")}`
      );
    return `<${enumValue}>`;
  });
}

Handlebars.registerHelper("printUriEnum", function (enumValue: unknown) {
  if (!(typeof enumValue === "string"))
    throw new Error(`printUriEnum only takes a string. Got "${enumValue}"`);
  return getEnumStringFromUri(enumValue, false);
});

createToSparqlLiteralHelper("toTaskStatusLiteral", TaskStatus);
createToSparqlLiteralHelper("toTaskTypeLiteral", TaskType);
createToSparqlLiteralHelper("toJobStatusLiteral", JobStatus);
createToSparqlLiteralHelper("toJobTypeLiteral", JobType);
createToSparqlLiteralHelper("toDayOfWeekLiteral", DayOfWeek);
createToSparqlLiteralHelper(
  "toDatamonitoringFunctionLiteral",
  DataMonitoringFunction
);

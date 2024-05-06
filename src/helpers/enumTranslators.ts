import {
  DataMonitoringFunction,
  DayOfWeek,
  JobStatus,
  JobType,
  TaskStatus,
  TaskType,
} from "types.js";
import Handlebars from "handlebars";

function createEnumTranslationHelper(
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

createEnumTranslationHelper("toTaskStatusLiteral", TaskStatus);
createEnumTranslationHelper("toTaskTypeLiteral", TaskType);
createEnumTranslationHelper("toJobStatusLiteral", JobStatus);
createEnumTranslationHelper("toJobTypeLiteral", JobType);
createEnumTranslationHelper("toDayOfWeekLiteral", DayOfWeek);
createEnumTranslationHelper(
  "toDatamonitoringFunctionLiteral",
  DataMonitoringFunction
);

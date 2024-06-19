import {
  DataMonitoringFunction,
  DayOfWeek,
  JobTemplateStatus,
  JobTemplateType,
  JobStatus,
  JobType,
} from "../types.js";
import Handlebars from "handlebars";

/**
 * The module contains the handlebar helper which convert an enum value of an enum containing URI's (either the key or the value) into the URI.
 * The rendered query will always contain the URI. The input of the helper can be an enum value.
 */
function createToHtmlHelper(
  handlebars: typeof Handlebars,
  funcName: string,
  enumObject: Record<string, string>,
  enumName: string
) {
  handlebars.registerHelper(funcName, function (enumValue: unknown) {
    if (typeof enumValue !== "string")
      throw `${funcName} ony takes one string as an argument.`;
    const key = Object.keys(enumObject).find(
      (k) => enumObject[k] === enumValue
    );
    if (!key)
      throw new Error(
        `${funcName} only takes one of: ${Object.values(enumObject).join(",")}`
      );
    return `<span class="enum-value">\
  <span class="enum-name">${enumName}:</span><span class="enum-key">${key}</span>\
  </span>`;
  });
}

export function addHelpers(handlebars: typeof Handlebars) {
  createToHtmlHelper(handlebars, "toJobStatus", JobStatus, "JobStatus");
  createToHtmlHelper(handlebars, "toJobType", JobType, "JobType");
  createToHtmlHelper(
    handlebars,
    "toJobTemplateStatus",
    JobTemplateStatus,
    "JobTemplateStatus"
  );
  createToHtmlHelper(
    handlebars,
    "toJobTemplateType",
    JobTemplateType,
    "JobTemplateType"
  );
  createToHtmlHelper(handlebars, "toDayOfWeek", DayOfWeek, "DayOfWeek");
  createToHtmlHelper(
    handlebars,
    "toDatamonitoringFunction",
    DataMonitoringFunction,
    "DataMonitoringFunction"
  );
}

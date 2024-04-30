import Handlebars from "handlebars";

Handlebars.registerHelper("listPopulated", function (list: any) {
  if (!(typeof list === "object"))
    throw new Error("listPopulated only takes an array as an argument.");
  if (!Array.isArray(list))
    throw new Error("listPopulated only takes an array as an argument.");
  return list.length > 0;
});

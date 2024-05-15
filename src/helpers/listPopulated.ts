import Handlebars from "handlebars";

Handlebars.registerHelper("listPopulated", function (list: any) {
  if (!list) return false;
  if (!(typeof list === "object"))
    throw new Error(
      `listPopulated only takes an array or a nullish value as an argument. Received "${list}" with type ${typeof list}`
    );
  if (!Array.isArray(list))
    throw new Error(
      `listPopulated only takes an array or a nullish value as an argument. Received "${list}" wich is an object but no array.`
    );
  return list.length > 0;
});

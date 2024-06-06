import Handlebars from "handlebars";

export function addHelpers(handlebars: typeof Handlebars) {
  // Returns true of both args are primitive (number,string,boolean) and equal
  handlebars.registerHelper(
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
  handlebars.registerHelper("listPopulated", function (list: any) {
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
}

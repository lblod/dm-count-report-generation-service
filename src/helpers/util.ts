import Handlebars from "handlebars";

Handlebars.registerHelper(
  "eq",
  function (one: string | number, two: string | number) {
    const typeOne = typeof one;
    const typeTwo = typeof two;
    if (typeOne === "string" && typeTwo === "string") return one === two;
    if (typeOne === "number" && typeTwo === "number") return one === two;
    throw new Error(
      `'eq' takes two parameters who can either be strings or numbers. They have to be the same type. Received ${one},${two}.`
    );
  }
);

import Handlebars from "handlebars";
import { addHelpers as addEnumHelpers } from "./enumTranslators.js";
import { addHelpers as addLiteralHelpers } from "./toLiteral.js";
import { addHelpers as addSparqlHelpers } from "./sparql.js";
import { addHelpers as addHtmlHelpers } from "./html.js";
import { addHelpers as addUtilHelpers } from "./util.js";

const sparqlHandlebars = Handlebars.create();
const htmlHandlebars = Handlebars.create();

addEnumHelpers(sparqlHandlebars);
addLiteralHelpers(sparqlHandlebars);
addSparqlHelpers(sparqlHandlebars);
addUtilHelpers(sparqlHandlebars);

addHtmlHelpers(htmlHandlebars);
addUtilHelpers(sparqlHandlebars);

export function compileSparql(
  templateString: string
): HandlebarsTemplateDelegate<any> {
  return sparqlHandlebars.compile(templateString, { noEscape: true });
}

export function compileHtml(
  templateString: string
): HandlebarsTemplateDelegate<any> {
  return htmlHandlebars.compile(templateString, { noEscape: false });
}

import { QueryEngine } from "@comunica/query-sparql";
import { Bindings, Term } from "@rdfjs/types";
import { config } from "../configuration.js";
import { DateOnly, TimeOnly } from "../date-util.js";
import dayjs from "dayjs";
import { store } from "./store.js";
import { DmEnum } from "../types.js";
import { logger } from "../logger.js";

const SKIP_PREFIX_REGEX = /^PREFIX[.\w\s:<>/\-#]+PREFIX[.\w\s:<>/\-#]+\n/g;

/**
 * Wrapper around logger.info
 * @param endpoint The url
 * @param query The query
 */
export function logQuery(endpoint: string, query: string, noPrefixes = true) {
  const toPrint = noPrefixes
    ? query.replace(SKIP_PREFIX_REGEX, "# Prefixes omitted\n")
    : query;
  logger.verbose(
    `SPARQL query to endpoint: ${endpoint}\n- - - - - - \n${toPrint}\n- - - - - - `
  );
}

/**
 * Uses setimeout to halt execution for 'millis' milliseconds asynchronously
 * @param millis number in mullisec
 * @returns A promise
 */
export function delay(millis: number): Promise<void> {
  if (millis === 0) return Promise.resolve();
  return new Promise<void>((res) => setTimeout(res, millis));
}

export type GetOrganisationsInput = {
  prefixes: string;
};

/**
 * Converts an RDFJS term to a javascript value
 * https://www.w3.org/TR/rdf11-concepts/#xsd-datatypes
 * @param term RDFJS term object
 * @returns A javascript value or object depending on the term datatype
 */
function toObject(
  term: Term | undefined
):
  | string
  | number
  | boolean
  | dayjs.Dayjs
  | DateOnly
  | TimeOnly
  | DmEnum
  | undefined {
  if (!term) return undefined;
  switch (term.termType) {
    case "Literal":
      switch (term.datatype.value) {
        case "http://www.w3.org/2001/XMLSchema#string":
          return term.value;
        case "http://www.w3.org/2001/XMLSchema#boolean":
          return term.value === "true";
        case "http://www.w3.org/2001/XMLSchema#integer":
        case "http://www.w3.org/2001/XMLSchema#int":
        case "http://www.w3.org/2001/XMLSchema#long":
          return parseInt(term.value);
        case "http://www.w3.org/2001/XMLSchema#float":
        case "http://www.w3.org/2001/XMLSchema#double":
          return parseFloat(term.value);
        case "http://www.w3.org/2001/XMLSchema#dateTime":
          return dayjs(term.value);
        case "http://www.w3.org/2001/XMLSchema#date":
          return new DateOnly(term.value);
        case "http://www.w3.org/2001/XMLSchema#time":
          return new TimeOnly(term.value);
        default:
          throw new Error(
            `No conversion function for literal of type ${term.datatype.value}`
          );
      }
    case "NamedNode": // For named nodes we just return the URI.
      // try {
      //   return getEnumFromUri(term.value);
      // } catch (e) {
      //   return term.value as string;
      // }
      return term.value;
    case "BlankNode":
      return `_`; // TODO: Elegant solution? Crash?
    default:
      throw new Error("No conversion function for this type of term yet.");
  }
}

function getKeysOfHeaders(headers: Headers): string[] {
  const result: string[] = [];
  headers.forEach((_, key) => result.push(key));
  return result;
}

function getHeaderTypeSafe(headers: any, key: string): string {
  if (!headers) throw new Error("No headers");
  // Headers as Headers
  if (headers instanceof Headers) {
    const targetHeader = headers.get(key.toLowerCase());
    if (!targetHeader)
      throw new Error(
        `Header wirth key ${key} not found in ${getKeysOfHeaders(headers)}`
      );
    return targetHeader;
  }
  // Headers as array
  if (Array.isArray(headers)) {
    const targetHeader = headers.find((header) => {
      if (Array.isArray(header) && header.length === 2) {
        return header[0] === key;
      }
      throw new Error(`Headers as array not formed correctly`);
    });
    if (!targetHeader) throw new Error(`Header wirth key ${key} not found`);
    return targetHeader[1];
  }
  // Headers as object of type Record<string,string>
  const result = headers[key];
  if (result && typeof result === "string") return result;
  throw new Error(
    `Was not able to extract header from headers object with key ${key}\nAs String:${headers}\nType: ${typeof headers}\nConstructor: ${
      headers.constructor?.name
    }\nAs JSON:\n${JSON.stringify(headers, undefined, 3)}`
  );
}

function getCustomFetchFunction(
  query: string
): (
  input: URL | string | Request,
  options: RequestInit | undefined
) => Promise<Response> {
  return async function (
    input: URL | string | Request,
    options: RequestInit | undefined
  ): Promise<Response> {
    if (!(options?.method === "POST") || !options?.headers)
      throw new Error(
        `This custom fetch function should only be used for INSERT queries with a POST type method. The method is ${options?.method}`
      );
    const userAgent = getHeaderTypeSafe(options.headers, "user-agent");
    if (!userAgent.includes("Comunica/actor-http-fetch"))
      throw new Error(
        `Custom fetch function only for comunica fetches. Wrong user agent.`
      );

    const headers = new Headers();
    headers.append("mu-auth-sudo", "true");
    headers.append("Content-Type", "application/x-www-form-urlencoded");
    headers.append("user-agent", userAgent);
    headers.append("Accept", "application/json");

    const body = new URLSearchParams();
    body.append("query", query);
    body.append("url", config.env.REPORT_ENDPOINT);

    const totalOptions: RequestInit = {
      ...options,
      method: "POST",
      headers,
      body,
    };
    const response = await fetch(input, totalOptions);
    // TODO hack virtuoso response to count amount of affected queries
    return response;
  };
}

class TemplatedQueryBase<T extends Record<string, any>> {
  queryEngine: QueryEngine;
  endpoint: string;
  template: HandlebarsTemplateDelegate<T>;
  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    template: HandlebarsTemplateDelegate<T>
  ) {
    this.queryEngine = queryEngine;
    this.endpoint = endpoint;
    this.template = template;
  }

  getQuery(input: T): string {
    return this.template(input);
  }
}

class VoidBase<T extends Record<string, any>> extends TemplatedQueryBase<T> {
  async _queryVoidToEndpoint(query: string): Promise<void> {
    try {
      await this.queryEngine.queryVoid(query, {
        sources: [
          {
            type: "sparql",
            value: this.endpoint,
          },
        ],
        destination: config.env.REPORT_ENDPOINT,
        fetch: getCustomFetchFunction(query),
      });
      if (config.env.SHOW_SPARQL_QUERIES) logQuery(this.endpoint, query);
    } catch (e) {
      logQuery(this.endpoint, query, false);
      logger.error(`Last query logged failed`);
      throw e;
    }
  }
}

/**
 * This class wraps around an INSERT style query constructed from a template.
 * Run execute asynchronously to perform the query and insert the data.
 * The type parameter should contain a type that is suitable for passing to the handlebars template
 * If debug endpoints are active it will record all created triples in memory.
 */
export class TemplatedInsert<
  T extends Record<string, any>
> extends VoidBase<T> {
  /**
   * Similar to objects and bindings in TemplatedSelect
   * @param input The input data structure for the handlebars template rendering
   */
  async execute(input: T): Promise<void> {
    const query = this.getQuery(input);
    // Write to report endpoint using custom fetch
    await this._queryVoidToEndpoint(query);
    if (!config.env.DISABLE_DEBUG_ENDPOINT && store) {
      // Query to store for buffering
      this.queryEngine.queryVoid(query, {
        sources: [
          {
            type: "sparql",
            value: this.endpoint,
          },
        ],
        destination: store,
      });
    }
  }
}

/**
 * This class wraps around an DELETE/INSERT style query constructed from a template.
 * Run execute asynchronously to perform the query and insert the data.
 * The type parameter should contain a type that is suitable for passing to the handlebars template
 * Unlike the insert type query any triples created will never be recorded in memory.
 */
export class TemplatedUpdate<
  T extends Record<string, any>
> extends VoidBase<T> {
  /**
   * Similar to objects and bindings in TemplatedSelect
   * @param input The input data structure for the handlebars template rendering
   */
  async execute(input: T): Promise<void> {
    const query = this.getQuery(input);
    // Write to report endpoint using custom fetch
    await this._queryVoidToEndpoint(query);
  }
}

/**
 * This class wraps around an SELECT style query constructed from a template.
 * Run bindings or objects asynchronously to perform the query and insert the data.
 * The first type parameter should contain a type that is suitable for passing to the handlebars template.
 * The second type parameter should contain a type that is suitable for the shape of each object associated with each row of results when the objects method is run.
 */
export class TemplatedSelect<
  T extends Record<string, any>,
  U extends Record<string, any>
> extends TemplatedQueryBase<T> {
  /**
   * Get query results as bindings
   * Unsuitable for more than 10k rows
   * @param input Handlebars input
   * @returns Comunica bindings array
   */
  async bindings(input: T): Promise<Bindings[]> {
    const query = this.getQuery(input);
    try {
      const bindingsStream = await this.queryEngine.queryBindings(query, {
        sources: [this.endpoint],
      });
      if (config.env.SHOW_SPARQL_QUERIES) logQuery(this.endpoint, query);
      return bindingsStream.toArray();
    } catch (e) {
      logQuery(this.endpoint, query, false);
      logger.error(`Last query logged failed`);
      throw e;
    }
  }

  /**
   * Get query result as an array of objects with type U
   * Unsuitable for more than 10k rows
   * @param uriKey The key in the query pointing to the URI of the object you want to construct
   * @param input Handlebars input
   * @returns An array of objects
   */
  async objects(uriKey: string, input: T): Promise<U[]> {
    const query = this.getQuery(input);
    const bindingsStream = await (async () => {
      try {
        const bindings = await this.queryEngine.queryBindings(query, {
          sources: [this.endpoint],
          lenient: true,
        });
        if (config.env.SHOW_SPARQL_QUERIES) logQuery(this.endpoint, query);
        return bindings;
      } catch (e) {
        logQuery(this.endpoint, query, false);
        logger.error(`Last query logged failed`);
        throw e;
      }
    })();

    const termResult: Map<string, Record<string, Term | Term[]>> = new Map();

    for await (const bindings of bindingsStream) {
      const uriTerm = bindings.get(uriKey);
      if (!uriTerm)
        throw new Error(
          `May only transform bindings to object if the uri of the resource is present in each termResult row. Uri key is "${uriKey}". Keys present are: ${[
            ...bindings.keys(),
          ].join(",")}`
        );
      const obj: Record<string, Term | Term[]> = (() => {
        if (termResult.has(uriTerm.value)) {
          return termResult.get(uriTerm.value)!;
        } else {
          const newObj: Record<string, any> = {};
          termResult.set(uriTerm.value, newObj);
          return newObj;
        }
      })();
      // now populate the object
      for (const [variabele, term] of bindings) {
        if (variabele.value in obj) {
          const reference = obj[variabele.value] as Term | Term[];
          if (Array.isArray(reference)) {
            if (!reference.some((t) => term.equals(t))) reference.push(term);
          } else {
            if (!reference.equals(term))
              obj[variabele.value] = [reference, term];
          }
        } else {
          obj[variabele.value] = term;
        }
      }
    }
    const result = [...termResult.values()].map<U>((termObject) => {
      const output: Record<string, any> = {};
      for (const [key, value] of Object.entries(termObject)) {
        if (Array.isArray(value)) {
          output[key] = value.map((i) => toObject(i));
        } else {
          output[key] = toObject(value);
        }
      }
      return output as U;
    });
    return result;
  }

  /**
   * Useful for queries with a single row as a result. Works like objects but only returns the first result
   * Will throw when more than 1 row was returned
   * @param input Handlebars input
   * @returns A single object
   */
  async result(input: T): Promise<U> {
    const query = this.getQuery(input);
    const bindingsStream = await (async () => {
      try {
        const bindings = await this.queryEngine.queryBindings(query, {
          sources: [this.endpoint],
        });
        if (config.env.SHOW_SPARQL_QUERIES) logQuery(this.endpoint, query);
        return bindings;
      } catch (e) {
        logQuery(this.endpoint, query, false);
        logger.error(`Last query logged failed`);
        throw e;
      }
    })();
    let first = true;
    let result = undefined;
    for await (const binding of bindingsStream) {
      if (!first)
        throw new Error(
          `Result method is only for sparql queries that return only a single row.`
        );
      result = [...binding.keys()].reduce<Record<string, any>>((acc, curr) => {
        acc[curr.value] = toObject(binding.get(curr.value));
        return acc;
      }, {});
      first = false;
    }
    return result as U;
  }
}
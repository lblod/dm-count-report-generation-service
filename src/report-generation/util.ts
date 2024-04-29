import { QueryEngine } from "@comunica/query-sparql";
import { Bindings, Term } from "@rdfjs/types";
import type { QueryStringContext } from "@rdfjs/types";
import { config } from "configuration";

export function logQuery(endpoint:string,query:string) {
  console.log(`SPARQL query to endpoint: ${endpoint}\n- - - - - - \n${query}\n- - - - - - `);
}

export function delay(millis: number):Promise<void> {
  if (millis === 0) return Promise.resolve();
  return new Promise<void>((res)=>setTimeout(res,millis));
}

export type GetOrganisationsInput = {
  prefixes: string,
}

// See: https://www.w3.org/TR/rdf11-concepts/#xsd-datatypes
function toObject(term:Term): string | number | boolean {
  switch(term.termType) {
    case "Literal":
      switch (term.datatype.value) {
        case "http://www.w3.org/2001/XMLSchema#string":
          return term.value;
        case "http://www.w3.org/2001/XMLSchema#boolean":
          return term.value==="true";
        case "http://www.w3.org/2001/XMLSchema#integer":
        case "http://www.w3.org/2001/XMLSchema#int":
        case "http://www.w3.org/2001/XMLSchema#long":
          return parseInt(term.value);
        case "http://www.w3.org/2001/XMLSchema#float":
        case "http://www.w3.org/2001/XMLSchema#double":
          return parseFloat(term.value);
        default:
          throw new Error(`No conversion function for literal of type ${term.datatype.value}`);
      }
    case "NamedNode": // For named nodes we just return the URI
      return term.value;
    case "BlankNode":
      return `<_>`;
    default:
      throw new Error("No conversion function for this type of term yet.")
  }
}

function getKeysOfHeaders(headers:Headers): string[] {
  const result: string[] = [];
  headers.forEach((_,key)=>result.push(key))
  return result;
}

function getHeaderTypeSafe(headers: any, key:string): string {
  if (!headers) throw new Error('No headers');
  // Headers as Headers
  if (headers instanceof Headers) {
    const targetHeader = headers.get(key.toLowerCase());
    if (!targetHeader) throw new Error(`Header wirth key ${key} not found in ${getKeysOfHeaders(headers)}`);
    return targetHeader;
  };
  // Headers as array
  if (Array.isArray(headers)) {
    const targetHeader = headers.find((header)=>{
      if (Array.isArray(header) && header.length === 2) {
        return header[0]===key;
      }
      throw new Error(`Headers as array not formed correctly`);
    });
    if (!targetHeader) throw new Error(`Header wirth key ${key} not found`);
    return targetHeader[1];
  }
  // Headers as object of type Record<string,string>
  const result = headers[key];
  if (result && typeof result === 'string') return result;
  throw new Error(`Was not able to extract header from headers object with key ${key}\nAs String:${headers}\nType: ${typeof headers}\nConstructor: ${headers.constructor?.name}\nAs JSON:\n${JSON.stringify(headers,undefined,3)}`);
}

function getCustomFetchFunction(query:string):(input: URL | string | Request,options:RequestInit | undefined)=>Promise<Response> {
  return async function(input: URL | string | Request,options:RequestInit | undefined): Promise<Response> {
    // if (!(options?.method==='POST')) return await fetch(input,options);
    if (!(options?.method==='POST') || !(options?.headers)) throw new Error(
      `This custom fetch function should only be used for INSERT queries with a POST type method. The method is ${options?.method}`
    );
    const userAgent = getHeaderTypeSafe(options.headers,'user-agent');
    if (!(userAgent.includes('Comunica/actor-http-fetch'))) throw new Error(
      `Custom fetch function only for comunica fetches. Wrong user agent.`
    )

    // const acceptHeaderFromComunica = (()=>{
    //   if (!options) return "application/json";
    //   if (!options.headers) throw new Error('Comunica did not pass a headers object');
    //   if (options.headers instanceof Headers) {
    //     const acceptHeader = options.headers.get('accept');
    //     if (!acceptHeader) throw new Error('No accept header passed');
    //     return acceptHeader;
    //   };
    //   if (Array.isArray(options.headers)) {
    //     const acceptHeader = options.headers.find((header)=>header[0]==='accept');
    //     if (!acceptHeader || acceptHeader[1]) throw new Error('No accept header passed');
    //     return acceptHeader[1];
    //   }
    //   try {
    //     return options.headers
    //     throw new Error(`Was not able to extract header`);
    //   } catch (e) {
    //     throw new Error('Header extraction from headers object failed.')
    //   }
    // })();

    console.log('comunicaheaders',options.headers);


    const headers = new Headers();
    headers.append("mu-auth-sudo","true");
    headers.append("Content-Type","application/x-www-form-urlencoded");
    headers.append("user-agent",userAgent);
    headers.append("Accept","application/json");

    const body = new URLSearchParams();
    body.append('query',query);
    body.append('url',config.env.REPORT_ENDPOINT);

    const totalOptions: RequestInit = {
      ...options,
      method:'POST',
      headers,
      body,
    };
    const response = await fetch(input,totalOptions);
    return response;
  }
}

class TemplatedQueryBase<T extends {}> {
  queryEngine: QueryEngine;
  endpoint: string;
  template: HandlebarsTemplateDelegate<T>;
  constructor(
    queryEngine: QueryEngine,
    endpoint: string,
    template: HandlebarsTemplateDelegate<T>,
  ) {
    this.queryEngine = queryEngine;
    this.endpoint = endpoint;
    this.template = template;
  }

  getQuery(input:T):string {
    return this.template(input);
  }
}

export class TemplatedInsert<T extends {}> extends TemplatedQueryBase<T> {
  async insertData(input:T):Promise<void> {
    const query = this.getQuery(input);
    if (config.env.SHOW_SPARQL_QUERIES) logQuery(this.endpoint,query);
    this.queryEngine.queryVoid(query,{
      sources: [{
        type:'sparql',
        value: this.endpoint,
      }],
      fetch:getCustomFetchFunction(query),
    });
  }
}

export class TemplatedSelect<T extends {},U extends {}> extends TemplatedQueryBase<T> {
  async bindings(input: T):Promise<Bindings[]> {
    const query = this.getQuery(input);
    if (config.env.SHOW_SPARQL_QUERIES) logQuery(this.endpoint,query);
    const bindingsStream = await this.queryEngine.queryBindings(query,{
      sources: [this.endpoint],
    });
    return (bindingsStream.toArray());
  }

  async objects(input: T): Promise<U[]> {
    const query = this.getQuery(input);
    if (config.env.SHOW_SPARQL_QUERIES) logQuery(this.endpoint,query);
    const bindingsStream = await this.queryEngine.queryBindings(query,{
      sources: [this.endpoint],
    });
    const result: Record<string,any>[] = [];
    for await (const binding of bindingsStream) {
      const obj: Record<string,any> = {};
      for (const key of binding.keys()) {
        const term = binding.get(key);
        if (!term) throw new Error("Received incomplete binding. Expected key is not found.");
        obj[key.value] = toObject(term);
      }
      result.push(obj);
    }
    return result as U[];
  }
}

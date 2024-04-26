import { QueryEngine } from "@comunica/query-sparql";
import { Bindings, Term } from "@rdfjs/types";
import type { QueryStringContext } from "@rdfjs/types";
import { config } from "configuration";

export type PrefixesInput = {
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
      break;
    case "NamedNode":
      return `<${term.value}>`;
    case "BlankNode":
      return `<_>`;
    default:
      throw new Error("No conversion function for this type of term yet.")
  }
}

function getCustomFetchFunction(query:string):(input: URL | string | Request,options:RequestInit | undefined)=>Promise<Response> {
  return async function(input: URL | string | Request,options:RequestInit | undefined): Promise<Response> {
    if (!(options?.method==='POST')) return await fetch(input,options);

    const newHttpHeaders = {
      "mu-auth-sudo":"true",
      // "authentication":"Basic dba:dba",
      "content-type":"application/x-www-form-urlencoded",
      "user-agent":"abb-report-generation-service",
      "accept":"application/sparql-results+json,application/json",
    }
    const formBody = new URLSearchParams();
    formBody.append('update',query);
    formBody.append('url',config.env.REPORT_ENDPOINT);
    console.log(formBody.toString());


    const totalOptions: RequestInit = {
      ...options,
      method:'POST',
      headers: {
        ...newHttpHeaders,
        ...options?.headers,
      },
      body: formBody,
    };
    const response = await fetch(input,totalOptions);
    console.log(response.toString());
    return response;
  }
}

export class TemplatedQuery<T extends {},U extends {}> {
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


  async insertData(input:T):Promise<void> {
    const query = this.getQuery(input);
    this.queryEngine.queryVoid(query,{
      sources: [{
        type:'sparql',
        value: this.endpoint,
      }],
      fetch:getCustomFetchFunction(query),
    });
  }
  async getBindings(input: T):Promise<Bindings[]> {
    const query = this.getQuery(input);
    const bindingsStream = await this.queryEngine.queryBindings(query,{
      sources: [this.endpoint],
    });
    return (bindingsStream.toArray());
  }
  async getObjects(input: T): Promise<U[]> {
    const query = this.getQuery(input);
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

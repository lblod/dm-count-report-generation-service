import { ZodError } from "zod";

export class ZodParseError extends Error {
  error: ZodError;
  constructor(message:string,error:ZodError) {
    super(message);
    this.error=error;
  }
  override toString() {
    const superResult = super.toString();
    const zodResult = this.error.format();
    return `${superResult}\nZodError\n----\n${zodResult}\n----\n`;
  }
}

import { config, PREFIXES_RECORD } from "../configuration.js";
import N3 from "n3";
import fs from "node:fs";

export let store = config.env.DISABLE_DEBUG_ENDPOINT ? null : new N3.Store();

/**
 * Dumps the triples in the memory buffer to a file. Useful for debugging.
 * @param fileName The filename of the file to write the Turtle to.
 */
export function dumpStore(fileName: string): void {
  if (config.env.DISABLE_DEBUG_ENDPOINT || store === null)
    throw new Error(
      "This function may not be invoked if debug endpoints are disabled"
    );
  const fileWriteStream = fs.createWriteStream(fileName, { encoding: "utf-8" });
  const writer = new N3.Writer(fileWriteStream, {
    format: "turtle",
    prefixes: PREFIXES_RECORD,
  });

  // Very heavy potentially and blocking
  // Not for production use
  for (const quad of store) writer.addQuad(quad);

  writer.end();
  fileWriteStream.close();
}

/**
 * Release the memory store and create a new one. This effectively deletes the memory buffer.
 */
export function clearStore(): void {
  store = new N3.Store();
}

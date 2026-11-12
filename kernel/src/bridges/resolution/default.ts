import { composeQuery } from "../../route";
import { loadDocument } from "./document";
import type { DocumentResolver } from "./shared";

/** Display every document address through the packaged View lens. */
export function createDefaultResolver(kernelUrl: string): DocumentResolver {
  return async (src, signal) => {
    return {
      // Lens HTML lives beside init.js
      srcdoc: await loadDocument(new URL("view/index.html", kernelUrl), signal),
      query: src.startsWith("?") ? src : composeQuery(undefined, src),
    };
  };
}

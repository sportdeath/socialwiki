import { composeQuery } from "../../route";
import { loadParsedDocument, serializeDocument } from "./document";
import type { DocumentResolver } from "./shared";

/** Display every document address through the packaged View lens. */
export function createDefaultResolver(
  kernelUrl: string,
  kernelSource: Promise<string>,
): DocumentResolver {
  return async (src, signal) => {
    // The packaged View lens declares its kernel relative to its own URL.
    const { document, url } = await loadParsedDocument(new URL("view/index.html", kernelUrl), signal);
    const script = document.querySelector<HTMLScriptElement>('script[src="../init.js"]');
    if (!script) throw new Error("The View lens is missing its kernel script");
    script.removeAttribute("src");
    script.text = await kernelSource;
    return {
      srcdoc: serializeDocument(document, url),
      query: src.startsWith("?") ? src : composeQuery(undefined, src),
    };
  };
}

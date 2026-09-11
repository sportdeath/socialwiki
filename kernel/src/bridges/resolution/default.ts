import { parseAddress } from "../../route";
import { DEFAULT_BASE_URL } from "../../constants";
import { loadDocument } from "./document";
import type { DocumentResolver } from "./shared";

const lensPaths = {
  // Lens HTML lives beside init.js
  v: "view/index.html",
  e: "edit/index.html",
  h: "history/index.html",
} as const;

type Lens = keyof typeof lensPaths;

function isLens(value: string): value is Lens {
  return Object.hasOwn(lensPaths, value);
}

/** The root fallback which recognizes Social.Wiki's v/e/h routes. */
export function createDefaultResolver(
  kernelUrl: string,
  baseUrl: string = DEFAULT_BASE_URL,
): DocumentResolver {
  return async (src, signal) => {
    // baseUrl interprets the requested address only. A document's stable base
    // is inherited separately through the navigation bridge.
    // It does not select lens assets; kernelUrl locates the default distribution.
    const url = new URL(src, baseUrl);
    if (!url.hash.startsWith("#/")) {
      throw new Error(`Could not resolve transclusion: ${src}`);
    }

    const { name: lens, query } = parseAddress(url.hash.slice(2));
    if (!isLens(lens)) throw new Error(`Unrecognized lens: ${lens}`);

    return {
      srcdoc: await loadDocument(new URL(lensPaths[lens], kernelUrl), signal),
      query,
      status: "loading",
    };
  };
}

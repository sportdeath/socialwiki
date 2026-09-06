import { parseAddress } from "../../route";
import type { DocumentResolver } from "./shared";

const lensPaths = {
  // Lens HTML is deployed separately from the kernel bundles.
  v: "/view/index.html",
  e: "/edit/index.html",
  h: "/history/index.html",
} as const;

type Lens = keyof typeof lensPaths;

function isLens(value: string): value is Lens {
  return Object.hasOwn(lensPaths, value);
}

async function loadLens(
  lens: Lens,
  kernelOrigin: string,
  signal?: AbortSignal,
) {
  const response = await fetch(new URL(lensPaths[lens], kernelOrigin), {
    signal,
  });
  if (!response.ok) {
    throw new Error(
      `Could not load ${lens} lens (${response.status} ${response.statusText})`,
    );
  }
  return response.text();
}

/** The root fallback which recognizes Social.Wiki's v/e/h routes. */
export function createDefaultResolver(
  kernelOrigin: string,
  baseUrl: string = window.location.href,
): DocumentResolver {
  return async (src, signal) => {
    // baseUrl interprets the requested address only. A document's stable base
    // is inherited separately through the navigation bridge.
    const url = new URL(src, baseUrl);
    if (!url.hash.startsWith("#/")) {
      throw new Error(`Could not resolve transclusion: ${src}`);
    }

    const { name: lens, query } = parseAddress(url.hash.slice(2));
    if (!isLens(lens)) throw new Error(`Unrecognized lens: ${lens}`);

    return {
      srcdoc: await loadLens(lens, kernelOrigin, signal),
      query,
      status: "loading",
    };
  };
}

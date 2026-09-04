/**
 * The complete result of resolving a transclude's `src`. `srcdoc` identifies
 * the executable document, while `query` is replaceable state within it. Equal
 * `srcdoc` values can therefore be reused with different queries.
 */
export type ResolvedDocument = {
  srcdoc: string;
  query: string;
  /** Initial transclude status until the document reports its own output. */
  status: string;
};

/**
 * Resolve `src` exactly as written by the transclude. The resolver owns its
 * URL or application-specific interpretation and should honor `signal` when
 * doing asynchronous work.
 */
export type DocumentResolver = (
  src: string,
  signal?: AbortSignal,
) => ResolvedDocument | Promise<ResolvedDocument>;

export function isResolvedDocument(value: unknown): value is ResolvedDocument {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.srcdoc === "string" &&
    typeof candidate.query === "string" &&
    typeof candidate.status === "string"
  );
}

export const RESOLUTION_REQUEST_EVENT = "sw-resolution-request";
export const RESOLUTION_RESPONSE_EVENT = "sw-resolution-response";

declare global {
  interface Window {
    /**
     * Replace the resolver used by this document's transcludes.
     */
    handleDocumentResolution: typeof handleDocumentResolution;
  }
}

let resolver: DocumentResolver | undefined;

/** Replace the resolver used by this document's transcludes. */
export function handleDocumentResolution(next: DocumentResolver) {
  resolver = next;
}

window.handleDocumentResolution = handleDocumentResolution;

/** Resolve through this document's current handler. */
export const resolveDocument: DocumentResolver = (src, signal) => {
  if (!resolver) throw new Error(`No document resolver handled: ${src}`);
  return resolver(src, signal);
};

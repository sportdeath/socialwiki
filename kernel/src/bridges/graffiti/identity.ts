import { encodeGuardSiteId } from "@graffiti-garden/wrapper-data-guard";
import { prepareFrameData } from "../bootstrap";
import { withParentSource } from "../source";

declare global {
  interface Window {
    /** This document's opaque permission-scope ID, matching value["via site"].id. */
    readonly guard: { readonly id: string };
  }
}

export function installGuardIdentity(path: unknown): readonly string[] {
  if (!Array.isArray(path) || !path.length ||
      path.some(part => typeof part !== "string" || !part)) {
    throw new Error("Missing or invalid guard identity in the frame bootstrap.");
  }
  const guardPath = Object.freeze([...path] as string[]);
  // Share the guard's stamp encoding; names and routes can change independently.
  Object.defineProperty(window, "guard", {
    value: Object.freeze({ id: encodeGuardSiteId(guardPath) }),
    enumerable: true,
  });
  return guardPath;
}

export function prepareGuardFrame(
  iframe: HTMLIFrameElement,
  host: HTMLElement,
  parentPath: readonly string[],
) {
  // Use the same scope rule and fallback IDs as outgoing requests. Changing
  // an element's ID or permission-scope already replaces its child frame.
  prepareFrameData(iframe, "guardPath", [
    ...parentPath, ...withParentSource(host, []).map(({ id }) => id),
  ]);
}

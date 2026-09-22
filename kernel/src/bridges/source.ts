/** A containing document's identity for a transcluded permission scope. */
export type SourceSegment = { id: string; name: string };

const fallbackIds = new WeakMap<HTMLElement, string>();

export function validateSource(value: unknown): SourceSegment[] {
  if (!Array.isArray(value) || value.some((s) => !s ||
      typeof s.id !== "string" || !s.id || typeof s.name !== "string")) {
    throw new TypeError("Invalid permission source path.");
  }
  return value.map(({ id, name }) => ({ id, name }));
}

export function sourceFromElement(element: HTMLElement): SourceSegment {
  // Read attributes per request: parents may rename or replace a document.
  let id = element.id || fallbackIds.get(element);
  if (!id) {
    // randomUUID is unavailable in insecure data frames; getRandomValues is not.
    id = crypto.randomUUID?.() ?? crypto.getRandomValues(new Uint32Array(4)).join("-");
    fallbackIds.set(element, id);
  }
  return { id, name: element.getAttribute("name") || "Unnamed" };
}

export function withParentSource(
  host: HTMLElement,
  childSource: SourceSegment[],
): SourceSegment[] {
  // Scope inheritance is chosen by the containing document. The sandboxed
  // child cannot grant it to itself; ancestors intentionally retain authority.
  return host.getAttribute("permission-scope") === "inherit"
    ? childSource
    : [sourceFromElement(host), ...childSource];
}

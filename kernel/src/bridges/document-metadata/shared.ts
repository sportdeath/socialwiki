export const DOCUMENT_METADATA_EVENT = "sw-document-metadata";

export type DocumentMetadata = {
  title: string;
  icon: string | null;
};

/** Only image data URLs and absolute HTTPS URLs cross the sandbox boundary. */
export function normalizeDocumentIcon(href: string): string | null {
  const value = href.trim();
  if (value.toLowerCase().startsWith("data:image/")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function readDocumentMetadata(source: Document = document): DocumentMetadata {
  const icons = source.querySelectorAll<HTMLLinkElement>('head link[rel~="icon"]');
  let icon: string | null = null;
  for (const link of icons) {
    // Read the authored attribute. link.href silently resolves a relative URL
    // against about:srcdoc, data:, or blob:, none of which is a portable icon.
    const candidate = normalizeDocumentIcon(link.getAttribute("href") ?? "");
    if (candidate) icon = candidate;
  }
  return { title: source.title, icon };
}

export function isDocumentMetadata(value: unknown): value is DocumentMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Record<string, unknown>;
  return typeof metadata.title === "string" &&
    (metadata.icon === null ||
      (typeof metadata.icon === "string" &&
        normalizeDocumentIcon(metadata.icon) === metadata.icon));
}

/** Promote the chosen child's metadata; the document's own icon is its fallback. */
export function applyDocumentMetadata(
  metadata: DocumentMetadata,
  fallbackTitle: string,
  target: Document = document,
) {
  target.title = metadata.title.trim() || fallbackTitle;

  let promoted = target.head.querySelector<HTMLLinkElement>(
    'link[rel="icon"][data-sw-promoted-icon]',
  );
  if (!metadata.icon) {
    promoted?.remove();
    return;
  }
  if (!promoted) {
    promoted = target.createElement("link");
    promoted.rel = "icon";
    promoted.setAttribute("data-sw-promoted-icon", "");
    target.head.append(promoted);
  }
  if (promoted.getAttribute("href") !== metadata.icon) {
    promoted.setAttribute("href", metadata.icon);
  }
}

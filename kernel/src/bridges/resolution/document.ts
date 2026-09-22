/** Serialize HTML for an originless frame, preserving its resource locations. */
export function serializeDocument(document: Document, url: string) {
  const html = document.documentElement.cloneNode(true) as HTMLElement;
  // Scripts, styles, and explicit bases retain their original locations.
  // Other web URLs must already be absolute; Social.Wiki links are handled by
  // the navigation bridge rather than the document's native URL base.
  for (const element of html.querySelectorAll("script[src], link[href], base[href]")) {
    const attribute = element.localName === "script" ? "src" : "href";
    element.setAttribute(attribute, new URL(element.getAttribute(attribute)!, url).href);
  }
  return (document.doctype ? "<!doctype html>" : "") + html.outerHTML;
}

export async function loadDocument(url: URL, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(
      `Could not load ${url} (${response.status} ${response.statusText})`,
    );
  }
  const document = new DOMParser().parseFromString(
    await response.text(),
    "text/html",
  );
  return serializeDocument(document, response.url || url.href);
}

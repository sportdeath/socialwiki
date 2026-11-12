type ScriptSpan = { start: number; end: number; element: HTMLScriptElement };

// Find the first ordinary head script without reparsing/serializing the page.
// Unknown markup stops the optimization; it still loads by its original URL.
export function findKernelScript(html: string, runtimeUrl: string): ScriptSpan | undefined {
  let start = 0;
  while (start < html.length) {
    const whitespace = /^\s+/.exec(html.slice(start));
    if (whitespace) { start += whitespace[0].length; continue; }
    if (/^<\!--/.test(html.slice(start))) {
      const end = html.indexOf("-->", start + 4);
      if (end < 0) return;
      start = end + 3; continue;
    }
    const tag = /^<(?:!doctype\s+html|html|head|meta|link|title|style|script)(?=[\s/>])/i.exec(html.slice(start));
    if (!tag) return;
    let end = start + tag[0].length, quote = "";
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === ">") break;
      else if (char === "<") return;
    }
    if (end === html.length) return;
    const name = tag[0].slice(1).toLowerCase();
    if (name === "title" || name === "style") {
      const close = new RegExp(`</${name}\\s*>`, "i").exec(html.slice(end + 1));
      if (!close) return;
      start = end + 1 + close.index + close[0].length; continue;
    }
    if (name !== "script") { start = end + 1; continue; }
    const close = /^\s*<\/script\s*>/i.exec(html.slice(end + 1));
    if (!close) return;
    const template = document.createElement("template");
    template.innerHTML = html.slice(start, end + 1) + "</script>";
    const element = template.content.firstElementChild;
    if (!(element instanceof HTMLScriptElement) || element.getAttribute("src") !== runtimeUrl) return;
    const allowed = new Set(["src", "data-document-route", "data-share-kernel", "vite-ignore"]);
    if ([...element.attributes].some(attribute => !allowed.has(attribute.name))) return;
    // Conservatively retain external loading for any HTTP-equivalent metadata.
    // False positives in comments/text only skip sharing; avoid parsing the
    // entire user document (and potentially initiating resource loads).
    if (/http-equiv/i.test(html)) return;
    return { start, end: end + 1 + close[0].length, element };
  }
}

export function inlineKernel(html: string, span: ScriptSpan, runtimeUrl: string, source: string) {
  // Preserve JavaScript bytes too. A custom runtime containing HTML raw-text
  // delimiters uses external loading instead of changing string/template values.
  if (/<\/script|<\!--/i.test(source)) return html;
  const script = span.element;
  script.removeAttribute("src");
  script.setAttribute("data-kernel-url", runtimeUrl);
  script.textContent = source;
  return html.slice(0, span.start) + script.outerHTML + html.slice(span.end);
}

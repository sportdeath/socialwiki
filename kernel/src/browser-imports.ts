declare const BROWSER_MODULES_SOURCE: string;
declare const KERNEL_IMPORT_MAP: { imports: Record<string, string> };

/** Keep the existing import names, backed by one module in this document. */
export function installBrowserImports() {
  const moduleUrl = URL.createObjectURL(new Blob([BROWSER_MODULES_SOURCE], {
    type: "text/javascript",
  }));
  const imports = Object.fromEntries(
    Object.entries(KERNEL_IMPORT_MAP.imports).flatMap(([name, cdnUrl]) => [
      [name, moduleUrl],
      // Packaged lenses use these exact versioned URLs instead of bare names.
      [cdnUrl, moduleUrl],
    ]),
  );
  const script = document.createElement("script");
  script.type = "importmap";
  script.textContent = JSON.stringify({ imports });
  document.head.append(script);
  // Keep the Blob URL for this document's lifetime, including later imports.
  return script;
}

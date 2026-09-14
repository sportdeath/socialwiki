const workerModules: Record<string, string> = {
  json: "language/json/json.worker.js",
  css: "language/css/css.worker.js",
  scss: "language/css/css.worker.js",
  less: "language/css/css.worker.js",
  html: "language/html/html.worker.js",
  handlebars: "language/html/html.worker.js",
  razor: "language/html/html.worker.js",
  typescript: "language/typescript/ts.worker.js",
  javascript: "language/typescript/ts.worker.js",
};

function getWorker(_workerId: string, label: string) {
  const moduleUrl = new URL(
    workerModules[label] ?? "editor/editor.worker.js",
    MONACO_WORKER_BASE_URL,
  );
  // A sandboxed document has an opaque origin and cannot construct a worker
  // directly from a CDN URL. A same-origin blob can import the pinned module.
  const blobUrl = URL.createObjectURL(
    new Blob([`import ${JSON.stringify(moduleUrl.href)};`], {
      type: "text/javascript",
    }),
  );
  const worker = new Worker(blobUrl, { name: label, type: "module" });
  URL.revokeObjectURL(blobUrl);
  return worker;
}

Object.assign(globalThis, { MonacoEnvironment: { getWorker } });

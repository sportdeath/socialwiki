import packageLock from "./package-lock.json" with { type: "json" };

const packages = packageLock.packages as Record<string, { version?: string }>;

// These must remain raw ESM so every bare "vue" import uses the import map's
// single compiler-enabled instance. The default Vue entry lacks the compiler;
// the default Vue Router entry also loads Devtools in sandboxed documents.
const rawBrowserEntrypoints: Record<string, string> = {
  vue: "dist/vue.esm-browser.prod.js",
  "vue-router": "dist/vue-router.esm-browser.prod.js",
  "@graffiti-garden/wrapper-vue": "dist/node/plugin.mjs",
};

function packageName(specifier: string) {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function packageVersion(name: string) {
  const version = packages[`node_modules/${name}`]?.version;
  if (!version) throw new Error(`${name} is not installed`);
  return version;
}

/** Whether an import refers to an npm package rather than a local module. */
export function isPackageImport(specifier: string) {
  return (
    !specifier.startsWith("\0") &&
    !specifier.startsWith(".") &&
    !specifier.startsWith("/") &&
    !specifier.includes(":")
  );
}

/**
 * Resolve package imports through jsDelivr. Most use its ESM service, which
 * follows package metadata; packages that must share Vue use raw ESM instead.
 */
export function packageImportUrl(specifier: string) {
  const name = packageName(specifier);
  const subpath = specifier.slice(name.length);
  const rawEntrypoint =
    subpath.length === 0 ? rawBrowserEntrypoints[name] : undefined;
  if (rawEntrypoint) return packageAssetUrl(name, rawEntrypoint);
  return `https://cdn.jsdelivr.net/npm/${name}@${packageVersion(name)}${subpath}/+esm`;
}

/** Resolve a non-entrypoint package asset at its lockfile-pinned version. */
function packageAssetUrl(name: string, path: string) {
  return `https://cdn.jsdelivr.net/npm/${name}@${packageVersion(name)}/${path}`;
}

// Public imports supplied to every Social.Wiki document by the kernel.
// Exact versions come from the lockfile, so the map stays in sync on updates.
export const browserImports = Object.fromEntries(
  [
    "vue",
    "@graffiti-garden/api",
    "@graffiti-garden/wrapper-synchronize",
    "@graffiti-garden/wrapper-vue",
  ].map((name) => [name, packageImportUrl(name)]),
);

export const monacoWorkerBaseUrl = packageAssetUrl(
  "monaco-editor",
  "esm/vs/",
);

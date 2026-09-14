import packageLock from "./package-lock.json" with { type: "json" };

const packages = packageLock.packages as Record<string, { version?: string }>;

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
 * Resolve a package import through jsDelivr's ESM service. The service follows
 * the package's exports/module/main metadata, so packages and subpaths do not
 * need hand-maintained browser entrypoint paths here.
 */
export function packageImportUrl(specifier: string) {
  const name = packageName(specifier);
  const subpath = specifier.slice(name.length);
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

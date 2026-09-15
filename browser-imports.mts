import packageLock from "./package-lock.json" with { type: "json" };

type PackageRecord = {
  version?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};
const packages = packageLock.packages as Record<string, PackageRecord>;

// These must remain raw ESM so every bare "vue" import uses the import map's
// single compiler-enabled instance. The default Vue entry lacks the compiler.
const rawBrowserEntrypoints: Record<string, string> = {
  vue: "dist/vue.esm-browser.prod.js",
  "@graffiti-garden/wrapper-vue": "dist/node/plugin.mjs",
};

/** Resolve an installed package's ESM entrypoint without duplicating it here. */
function rawPackageEntrypoint(name: string) {
  const resolved = import.meta.resolve(name);
  const packageRoot = `/node_modules/${name}/`;
  const rootIndex = resolved.lastIndexOf(packageRoot);
  if (rootIndex < 0) throw new Error(`Could not resolve ${name}'s entrypoint`);
  return resolved.slice(rootIndex + packageRoot.length);
}

// CodeMirror extensions exchange identity-sensitive state objects. Loading
// each package through a separately bundled CDN endpoint can duplicate those
// objects, so register its raw ESM dependency graph in the import map. Assign
// before recursing so dependency cycles are harmless.
function registerRawPackage(name: string) {
  if (Object.hasOwn(rawBrowserEntrypoints, name)) return;

  const record = packages[`node_modules/${name}`];
  if (!record) return;
  rawBrowserEntrypoints[name] = rawPackageEntrypoint(name);
  for (const dependency of Object.keys({
    ...record.dependencies,
    ...record.peerDependencies,
  })) {
    registerRawPackage(dependency);
  }
}

for (const name of Object.keys(packages.lenses?.dependencies ?? {})) {
  if (
    name === "codemirror" ||
    name.startsWith("@codemirror/") ||
    name.startsWith("@replit/codemirror-")
  ) {
    registerRawPackage(name);
  }
}

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
 * follows package metadata; identity-sensitive package graphs use raw ESM.
 */
export function packageImportUrl(specifier: string) {
  const name = packageName(specifier);
  const subpath = specifier.slice(name.length);
  const rawEntrypoint =
    subpath.length === 0 ? rawBrowserEntrypoints[name] : undefined;
  if (rawEntrypoint) {
    return `https://cdn.jsdelivr.net/npm/${name}@${packageVersion(name)}/${rawEntrypoint}`;
  }
  return `https://cdn.jsdelivr.net/npm/${name}@${packageVersion(name)}${subpath}/+esm`;
}

// Public imports supplied to every Social.Wiki document by the kernel.
// Exact versions come from the lockfile, so the map stays in sync on updates.
export const browserImports = Object.fromEntries(
  [
    "@graffiti-garden/api",
    "@graffiti-garden/wrapper-synchronize",
    ...Object.keys(rawBrowserEntrypoints),
  ].map((name) => [name, packageImportUrl(name)]),
);

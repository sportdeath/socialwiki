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
  "@graffiti-garden/wrapper-vue": "dist/browser/plugin.mjs",
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

function isCodeMirrorDependency(name: string) {
  return (
    name.startsWith("@codemirror/") ||
    name.startsWith("@lezer/") ||
    name.startsWith("@replit/codemirror-")
  );
}

function pinnedDependencies(name: string) {
  const seen = new Set([name]);
  function visit(packageName: string) {
    const record = packages[`node_modules/${packageName}`];
    for (const dependency of Object.keys({
      ...record?.dependencies,
      ...record?.peerDependencies,
    })) {
      if (seen.has(dependency)) continue;
      seen.add(dependency);
      visit(dependency);
    }
  }
  visit(name);
  seen.delete(name);
  return [...seen].sort().map((dependency) => `${dependency}@${packageVersion(dependency)}`);
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

/** Resolve package imports to CDN modules without bundling them into lenses. */
export function packageImportUrl(specifier: string) {
  const name = packageName(specifier);
  const subpath = specifier.slice(name.length);
  // Pin each package's dependency graph so esm.sh does not load a newer,
  // second copy of an identity-sensitive CodeMirror extension or state.
  if (
    !subpath &&
    (name === "codemirror" || isCodeMirrorDependency(name))
  ) {
    const dependencies = pinnedDependencies(name);
    const pins = dependencies.length ? `?deps=${dependencies.join(",")}` : "";
    return `https://esm.sh/${name}@${packageVersion(name)}${pins}`;
  }
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
  Object.keys(rawBrowserEntrypoints).map((name) => [name, packageImportUrl(name)]),
);

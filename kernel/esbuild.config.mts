import * as esbuild from "esbuild";
import packageLock from "../package-lock.json" with { type: "json" };

// Construct an import map that will be injected into documents.
// Graffiti wrappers and Vue are included via CDN
const browserEntrypoints = {
  vue: "dist/vue.esm-browser.prod.js",
  "@graffiti-garden/api": "dist/browser/index.js",
  "@graffiti-garden/wrapper-synchronize": "dist/browser/index.js",
  "@graffiti-garden/wrapper-vue": "dist/browser/plugin.mjs",
};
const packages = packageLock.packages as Record<string, { version?: string }>;
const imports = Object.fromEntries(
  Object.entries(browserEntrypoints).map(([name, path]) => {
    const dependency = packages[`node_modules/${name}`];
    if (!dependency?.version) throw new Error(`${name} is not installed`);
    return [
      name,
      `https://cdn.jsdelivr.net/npm/${name}@${dependency.version}/${path}`,
    ];
  }),
);

const options = {
  entryPoints: ["src/init.ts", "src/init-server.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  // Lenses include these files as classic scripts, so each entry must be a
  // self-contained bundle with no shared ESM chunks.
  splitting: false,
  format: "iife",
  outdir: "dist",
  loader: {
    ".css": "text",
  },
  define: {
    KERNEL_IMPORT_MAP: JSON.stringify({ imports }),
  },
} satisfies esbuild.BuildOptions;

if (process.argv.includes("--watch")) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}

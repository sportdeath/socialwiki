import * as esbuild from "esbuild";

await esbuild.build({
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
  logOverride: {
    "empty-import-meta": "silent",
  },
});

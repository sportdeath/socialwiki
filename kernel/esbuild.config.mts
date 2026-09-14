import * as esbuild from "esbuild";
import { browserImports } from "../browser-imports.mts";

const options = {
  entryPoints: ["src/init.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  // Lenses include this as a classic script.
  format: "iife",
  outdir: "dist",
  loader: {
    ".css": "text",
  },
  define: {
    KERNEL_IMPORT_MAP: JSON.stringify({ imports: browserImports }),
  },
} satisfies esbuild.BuildOptions;

if (process.argv.includes("--watch")) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  await esbuild.build(options);
}

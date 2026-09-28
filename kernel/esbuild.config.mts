import * as esbuild from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";
import { browserImports } from "../browser-imports.mts";

const options = {
  entryPoints: ["src/init.ts"],
  platform: "browser",
  bundle: true,
  sourcemap: true,
  minify: true,
  // Lenses include this as a classic script.
  format: "iife",
  loader: {
    ".css": "text",
  },
  define: {
    KERNEL_IMPORT_MAP: JSON.stringify({ imports: browserImports }),
  },
} satisfies esbuild.BuildOptions;

for (const [name, testGraffiti] of [["init", false], ["init-test", true]] as const) {
  const buildOptions = {
    ...options,
    outfile: `dist/${name}.js`,
    define: { ...options.define, TEST_GRAFFITI: String(testGraffiti) },
    plugins: [polyfillNode()],
  };
  if (process.argv.includes("--watch")) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
  } else {
    await esbuild.build(buildOptions);
  }
}

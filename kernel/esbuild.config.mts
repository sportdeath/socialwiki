import * as esbuild from "esbuild";
import { polyfillNode } from "esbuild-plugin-polyfill-node";
import { browserImports } from "../browser-imports.mts";

// Bundle the public libraries together, including dynamic dependencies such as
// AJV. They become source inside init.js, not separate files or CDN requests.
const browserModules = await esbuild.build({
  stdin: {
    contents: Object.keys(browserImports)
      .map(name => `export * from ${JSON.stringify(name)};`).join("\n"),
    resolveDir: import.meta.dirname,
  },
  alias: { vue: "vue/dist/vue.esm-browser.prod.js" },
  platform: "browser",
  bundle: true,
  splitting: false,
  format: "esm",
  minify: true,
  write: false,
  metafile: true,
});
if (browserModules.outputFiles.length !== 1 ||
    Object.values(browserModules.metafile.outputs).some(output => output.imports.length)) {
  throw new Error("The browser libraries must be one self-contained module");
}

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
    BROWSER_MODULES_SOURCE: JSON.stringify(browserModules.outputFiles[0].text),
  },
} satisfies esbuild.BuildOptions;

for (const [name, testGraffiti] of [["init", false], ["init-test", true]] as const) {
  const buildOptions = {
    ...options,
    outfile: `dist/${name}.js`,
    define: { ...options.define, TEST_GRAFFITI: String(testGraffiti) },
    // The kernel runs in a browser window. Its local test backend uses
    // FileReader for blobs; injecting Buffer pulls in an unused Node fallback.
    plugins: [polyfillNode({ globals: { buffer: false } })],
  };
  if (process.argv.includes("--watch")) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
  } else {
    await esbuild.build(buildOptions);
  }
}

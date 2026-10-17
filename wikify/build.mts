import { readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import * as esbuild from "esbuild";

// init.js supplies these modules through an import map in the Wikify document.
const external = ["vue", "@graffiti-garden/wrapper-vue"];

const options = {
  entryPoints: [resolve(import.meta.dirname, "src/index.ts")],
  outfile: resolve(import.meta.dirname, "dist/wikify.js"),
  bundle: true,
  external,
  platform: "browser",
  format: "esm",
  metafile: true,
  minify: true,
  sourcemap: true,
  loader: { ".html": "text", ".css": "text" },
} satisfies esbuild.BuildOptions;

if (process.argv.includes("--watch")) {
  const context = await esbuild.context(options);
  await context.watch();
} else {
  const result = await esbuild.build(options);
  const entry = Object.values(result.metafile.outputs).find((output) => output.entryPoint);
  const expected = new Set(external);
  if (!entry || entry.imports.length !== expected.size ||
      entry.imports.some(({ path, external }) => !external || !expected.delete(path))) {
    throw new Error("wikify.js must use only the kernel's mapped runtime imports");
  }
}

// Keep the copyable source example on the published runtime; only the dev
// build rewrites it to use the local kernel linked beside wikify.js.
const localExampleUrl = new URL("./dist/wikify-example.html", import.meta.url);
if (process.argv.includes("--dev-example")) {
  const example = await readFile(new URL("./example.html", import.meta.url), "utf8");
  const localExample = example.replace(
    'src="https://social.wiki/init.js"',
    'src="./init.js"',
  );
  if (localExample === example) throw new Error("Wikify example runtime URL was not found");
  await writeFile(localExampleUrl, localExample);
} else {
  await rm(localExampleUrl, { force: true });
}

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import ts from "typescript";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import {
  browserImports,
  isPackageImport,
  packageImportUrl,
} from "../browser-imports.mts";

export const root = resolve(import.meta.dirname, "src");
export const entries = {
  index: resolve(root, "index.html"),
  browser: resolve(root, "browser/index.html"),
  view: resolve(root, "view/index.html"),
  edit: resolve(root, "edit/index.html"),
  history: resolve(root, "history/index.html"),
} as const;
const locatorEntry = resolve(root, "locator.ts");

function includeTemplates(entryHtml: string): Plugin {
  const include = /^[ \t]*<!--\s*@include\s+([^\s]+)\s*-->/gm;
  const templatePath = (relative: string) => resolve(dirname(entryHtml), relative);
  return {
    name: "include-lens-templates",
    buildStart() {
      for (const [, relative] of readFileSync(entryHtml, "utf8").matchAll(include)) {
        this.addWatchFile(templatePath(relative));
      }
    },
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html.replace(include, (_match, relative: string) => {
          return readFileSync(templatePath(relative), "utf8");
        });
      },
    },
  };
}

function readableScript(code: string) {
  const ast = ts.createSourceFile("lens.js", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);

  // esbuild emits `void 0` for source `undefined`; restore the clearer spelling
  // only for actual expressions, not text inside the lens's HTML strings.
  const positions: Array<{ start: number; end: number }> = [];
  function visit(node: ts.Node) {
    if (ts.isVoidExpression(node) && ts.isNumericLiteral(node.expression) && node.expression.text === "0") {
      positions.push({ start: node.getStart(ast), end: node.getEnd() });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  for (const { start, end } of positions.sort((a, b) => b.start - a.start)) {
    code = `${code.slice(0, start)}undefined${code.slice(end)}`;
  }

  // These markers keep source comments through bundling; the markers and pure
  // annotations are no longer needed in the editable HTML.
  return code
    .replace(/(^[ \t]*)\/\/!/gm, "$1//")
    .replace(/(^[ \t]*)\/\*!/gm, "$1/*")
    .replace(/\/\* @__PURE__ \*\/ ?/g, "");
}

function readableLens(name: string): Plugin {
  return {
    name: "readable-lens",
    enforce: "post",
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "asset" || !output.fileName.endsWith(".html")) {
          continue;
        }
        const source = String(output.source);
        let foundStyle = false;
        let foundScript = false;
        const readableSource = source
          .replace(
            /<style(?=[^>]*\brel="stylesheet")[^>]*>([\s\S]*?)<\/style>/,
            (_match, css: string) => {
              foundStyle = true;
              return `<style>\n${css}\n</style>`;
            },
          )
          .replace(
            /<script(?=[^>]*\btype="module")(?=[^>]*\bcrossorigin)[^>]*>([\s\S]*?)<\/script>/,
            (_match, script: string) => {
              foundScript = true;
              return `<script type="module">\n${readableScript(script)}\n</script>`;
            },
          );
        if (!foundStyle || !foundScript) {
          throw new Error(`Could not format the generated ${name} lens`);
        }
        output.source = readableSource;
      }
    },
  };
}

function markTypeScriptComments(code: string) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    code,
  );
  const insertions: Array<{ offset: number; replace: boolean }> = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken;) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      const start = scanner.getTokenStart();
      const text = scanner.getTokenText();
      if (
        text[2] !== "!" &&
        !text.startsWith("///") &&
        !text.includes("@__PURE__")
      ) {
        insertions.push({
          offset: start + 2,
          // Turn a JSDoc opener into /*! instead of the awkward /*!*.
          replace: text.startsWith("/**"),
        });
      }
    }
    token = scanner.scan();
  }
  for (const { offset, replace } of insertions.reverse()) {
    code = `${code.slice(0, offset)}!${code.slice(offset + Number(replace))}`;
  }
  return code;
}

/** Keep comments from editable source modules close to their generated code. */
function preserveSourceComments(): Plugin {
  return {
    name: "preserve-source-comments",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?", 1)[0];
      if (file.endsWith(".ts")) {
        return { code: markTypeScriptComments(code), map: null };
      }
    },
  };
}

export function buildConfig(
  entry: keyof typeof entries,
  watch = false,
): UserConfig {
  return {
    root,
    // Portable as a directory on localhost, GitHub Pages, or a versioned CDN.
    base: "./",
    // Only the top-level needs to copy over the 404 redirect
    publicDir: entry === "index" ? "public" : false,
    plugins: [
      includeTemplates(entries[entry]),
      preserveSourceComments(),
      viteSingleFile({ removeViteModuleLoader: true }),
      ...(entry === "index" ? [] : [readableLens(entry)]),
    ],
    esbuild: { legalComments: "inline" },
    build: {
      outDir: resolve(import.meta.dirname, "dist"),
      emptyOutDir: false,
      minify: false,
      cssMinify: false,
      watch: watch ? {} : undefined,
      modulePreload: false,
      rollupOptions: {
        input: entries[entry],
        external: isPackageImport,
        output: {
          paths: (specifier) =>
            entry !== "index" &&
            Object.hasOwn(browserImports, specifier)
              ? specifier
              : packageImportUrl(specifier),
        },
      },
    },
    preview: { cors: true },
  };
}

export function locatorBuildConfig(watch = false): UserConfig {
  return {
    root,
    publicDir: false,
    esbuild: { legalComments: "inline" },
    build: {
      outDir: resolve(import.meta.dirname, "dist"),
      emptyOutDir: false,
      minify: false,
      watch: watch ? {} : undefined,
      rollupOptions: {
        input: locatorEntry,
        output: {
          entryFileNames: "locator.js",
          format: "iife",
        },
      },
    },
  };
}

// Production and watch builds use build.mts so each publishable lens can be
// bundled independently. This default is used by `vite preview`.
export default defineConfig({
  root,
  preview: { cors: true },
});

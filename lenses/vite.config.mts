import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import ts from "typescript";
import { defineConfig, type Plugin, type UserConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import {
  isPackageImport,
  monacoWorkerBaseUrl,
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
        const readableSource = source
          .replace(
            /<style(?=[^>]*\brel="stylesheet")[^>]*>([\s\S]*?)<\/style>/,
            `<style>\n/* BEGIN Social.Wiki ${name} lens styles */\n$1\n/* END Social.Wiki ${name} lens styles */\n</style>`,
          )
          .replace(
            /<script(?=[^>]*\btype="module")(?=[^>]*\bcrossorigin)[^>]*>([\s\S]*?)<\/script>/,
            `<script type="module">\n/* BEGIN Social.Wiki ${name} lens */\n$1\n/* END Social.Wiki ${name} lens */\n</script>`,
          );
        if (
          readableSource === source ||
          !readableSource.includes(`BEGIN Social.Wiki ${name} lens styles`) ||
          !readableSource.includes(`BEGIN Social.Wiki ${name} lens */`)
        ) {
          throw new Error(`Could not mark up the generated ${name} lens`);
        }
        output.source = readableSource;
      }
    },
  };
}

const vuePlugin = () =>
  vue({
    template: {
      compilerOptions: {
        isCustomElement: (tag) => tag === "sw-transclude",
      },
    },
  });

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
      const start = scanner.getTokenPos();
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
      if (file.endsWith(".vue")) {
        if (id.includes("type=script")) {
          return { code: markTypeScriptComments(code), map: null };
        }
        if (!id.includes("?")) {
          return {
            code: code.replace(
              /(<script\b[^>]*>)([\s\S]*?)(<\/script>)/g,
              (_match, open, script, close) =>
                `${open}${markTypeScriptComments(script)}${close}`,
            ),
            map: null,
          };
        }
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
      preserveSourceComments(),
      vuePlugin(),
      viteSingleFile({ removeViteModuleLoader: true }),
      ...(entry === "index" ? [] : [readableLens(entry)]),
    ],
    esbuild: { legalComments: "inline" },
    define: {
      MONACO_WORKER_BASE_URL: JSON.stringify(monacoWorkerBaseUrl),
    },
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
          paths: packageImportUrl,
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

import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve, isAbsolute, join } from "node:path";
import { build, type Plugin as EsbuildPlugin } from "esbuild";
import fs from "node:fs/promises";

const initScriptEntries = [
  {
    input: "src/backend/init-client.ts",
    output: "/init.js",
  },
  {
    input: "src/backend/init-server.ts",
    output: "/init-server.js",
  },
];

// Standalone lens HTML files import these absolute module paths directly.
// We emit them as stable, unhashed files so checked-in HTML remains valid.
const standaloneLensDependencyInputs = {
  "src/backend/route": resolve(__dirname, "src/backend/route.ts"),
  "src/backend/status-pages": resolve(__dirname, "src/backend/status-pages.ts"),
  "src/lenses/utils/default-trusted-editors": resolve(
    __dirname,
    "src/lenses/utils/default-trusted-editors.ts",
  ),
  "src/lenses/utils/page-versions": resolve(
    __dirname,
    "src/lenses/utils/page-versions.ts",
  ),
  "src/lenses/utils/protection": resolve(
    __dirname,
    "src/lenses/utils/protection.ts",
  ),
  "src/lenses/utils/TwoPaneLayout": resolve(
    __dirname,
    "src/lenses/utils/TwoPaneLayout.vue",
  ),
  "src/lenses/utils/schemas": resolve(__dirname, "src/lenses/utils/schemas.ts"),
  "src/lenses/utils/trust": resolve(__dirname, "src/lenses/utils/trust.ts"),
  "src/lenses/utils/vue-runtime": resolve(
    __dirname,
    "src/lenses/utils/vue-runtime.ts",
  ),
  "src/lenses/utils/monaco-editor-vue3": resolve(
    __dirname,
    "src/lenses/utils/monaco-editor-vue3.ts",
  ),
};

const standaloneLensDependencyAliases = Object.entries(
  standaloneLensDependencyInputs,
).map(([name, replacement]) => ({
  find: `/${name}.js`,
  replacement,
}));

const standaloneLensDependencyImportPathSet = new Set(
  Object.keys(standaloneLensDependencyInputs).map((name) => `/${name}.js`),
);

// Make Esbuild understand Vite string imports used by init scripts.
// This is necessary to bundle inline CSS and raw lens HTML defaults.
function inlineStringQueryPlugin(): EsbuildPlugin {
  return {
    name: "inline-string-query",
    setup(build) {
      build.onResolve({ filter: /\.(css|html)\?(inline|raw)$/ }, (args) => {
        const [withoutQuery] = args.path.split("?");
        const abs = isAbsolute(withoutQuery)
          ? withoutQuery
          : join(args.resolveDir, withoutQuery);

        return { path: abs, namespace: "inline-string-query" };
      });

      build.onLoad(
        { filter: /.*/, namespace: "inline-string-query" },
        async (args) => {
          const text = await fs.readFile(args.path, "utf8");
          return {
            contents: `export default ${JSON.stringify(text)};`,
            loader: "js",
          };
        },
      );
    },
  };
}
function serveInitJs(): Plugin {
  return {
    name: "serve-init-js",
    apply: "serve",
    configureServer(server) {
      for (const { input, output } of initScriptEntries) {
        server.middlewares.use(output, async (_req, res, next) => {
          try {
            const result = await build({
              entryPoints: [resolve(__dirname, input)],
              bundle: true,
              format: "iife",
              write: false,
              sourcemap: "inline",
              platform: "browser",
              plugins: [inlineStringQueryPlugin()],
              logOverride: {
                "empty-import-meta": "silent",
              },
            });

            res.setHeader("Content-Type", "application/javascript");
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.end(result.outputFiles[0].text);
          } catch (e) {
            next(e as any);
          }
        });
      }
    },
  };
}
function buildInitJs(): Plugin {
  return {
    name: "build-init-js",
    apply: "build",
    async writeBundle() {
      for (const { input, output } of initScriptEntries) {
        await build({
          entryPoints: [resolve(__dirname, input)],
          bundle: true,
          format: "iife",
          outfile: resolve(__dirname, `dist/${output}`),
          platform: "browser",
          sourcemap: false,
          minify: true,
          plugins: [inlineStringQueryPlugin()],
          logOverride: {
            "empty-import-meta": "silent",
          },
        });
      }
    },
  };
}

function stableOutputFilenames() {
  return {
    entryFileNames: (chunkInfo: { name: string }) => {
      if (chunkInfo.name.startsWith("src/")) {
        return `${chunkInfo.name}.js`;
      }
      return `assets/${chunkInfo.name}.js`;
    },
  };
}

export default defineConfig({
  resolve: {
    alias: standaloneLensDependencyAliases,
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === "sw-transclude",
        },
      },
    }),
    serveInitJs(),
    buildInitJs(),
  ],
  server: {
    cors: true,
  },
  worker: {
    rollupOptions: {
      output: {
        ...stableOutputFilenames(),
        minifyInternalExports: false,
      },
    },
  },
  build: {
    rollupOptions: {
      external: (id) =>
        standaloneLensDependencyImportPathSet.has(id) ||
        id.startsWith("/assets/"),
      preserveEntrySignatures: "strict",
      input: {
        ...standaloneLensDependencyInputs,
        main: resolve(__dirname, "index.html"),
      },
      // Keep import paths stable across builds so standalone HTML lenses can
      // reference shared JS/CSS without hash churn.
      output: {
        ...stableOutputFilenames(),
        minifyInternalExports: false,
      },
    },
  },
});

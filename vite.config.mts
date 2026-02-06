import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve, isAbsolute, join } from "node:path";
import { build, type Plugin as EsbuildPlugin } from "esbuild";
import fs from "node:fs/promises";

const files = [
  {
    input: "src/backend/init-client.ts",
    output: "/init.js",
  },
  {
    input: "src/backend/init-server.ts",
    output: "/init-server.js",
  },
];

// Make Esbuild understand vite string imports
// This is necessary to bundle styling for status
// pages into transclude
function inlineCssQueryPlugin(): EsbuildPlugin {
  return {
    name: "inline-css-query",
    setup(build) {
      build.onResolve({ filter: /\.css\?(inline|raw)$/ }, (args) => {
        const [withoutQuery] = args.path.split("?");
        const abs = isAbsolute(withoutQuery)
          ? withoutQuery
          : join(args.resolveDir, withoutQuery);

        return { path: abs, namespace: "inline-css-query" };
      });

      build.onLoad(
        { filter: /.*/, namespace: "inline-css-query" },
        async (args) => {
          const css = await fs.readFile(args.path, "utf8");
          return {
            contents: `export default ${JSON.stringify(css)};`,
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
      for (const { input, output } of files) {
        server.middlewares.use(output, async (_req, res, next) => {
          try {
            const result = await build({
              entryPoints: [resolve(__dirname, input)],
              bundle: true,
              format: "iife",
              write: false,
              sourcemap: "inline",
              platform: "browser",
              plugins: [inlineCssQueryPlugin()],
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
      for (const { input, output } of files) {
        await build({
          entryPoints: [resolve(__dirname, input)],
          bundle: true,
          format: "iife",
          outfile: resolve(__dirname, `dist/${output}`),
          platform: "browser",
          sourcemap: false,
          minify: true,
          plugins: [inlineCssQueryPlugin()],
          logOverride: {
            "empty-import-meta": "silent",
          },
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => ["sw-transclude"].includes(tag),
        },
      },
    }),
    serveInitJs(),
    buildInitJs(),
  ],
  server: {
    cors: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        view: resolve(__dirname, "src/lenses/view/index.html"),
        edit: resolve(__dirname, "src/lenses/edit/index.html"),
        history: resolve(__dirname, "src/lenses/history/index.html"),
        version: resolve(__dirname, "src/lenses/version/index.html"),
      },
    },
  },
});

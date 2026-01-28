import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { build } from "esbuild";

const files = [
  {
    input: "src/page-init/init.ts",
    output: "/init.js",
  },
  {
    input: "src/page-init/init-server.ts",
    output: "/init-server.js",
  },
];

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
        });
      }
    },
  };
}

export default defineConfig({
  plugins: [vue(), serveInitJs(), buildInitJs()],
});

import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { build } from "esbuild";

const initEntry = resolve(__dirname, "src/page-init/init.ts");

function serveInitJs(): Plugin {
  return {
    name: "serve-init-js",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/init.js", async (_req, res, next) => {
        try {
          const result = await build({
            entryPoints: [initEntry],
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
    },
  };
}
function buildInitJs(): Plugin {
  return {
    name: "build-init-js",
    apply: "build",
    async writeBundle() {
      await build({
        entryPoints: [initEntry],
        bundle: true,
        format: "iife",
        outfile: resolve(__dirname, "dist/init.js"),
        platform: "browser",
        sourcemap: false,
        minify: true,
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), serveInitJs(), buildInitJs()],
});

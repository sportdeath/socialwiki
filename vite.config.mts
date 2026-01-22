import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";
import { build } from "esbuild";

function serveClientJs(): Plugin {
  const entry = resolve(__dirname, "src/rpc/client.ts");

  return {
    name: "serve-client-js",
    apply: "serve", // dev only
    configureServer(server) {
      server.middlewares.use("/client.js", async (_req, res, next) => {
        try {
          const result = await build({
            entryPoints: [entry],
            bundle: true,
            format: "esm",
            write: false,
            sourcemap: "inline",
            platform: "browser",
          });

          res.setHeader("Content-Type", "application/javascript");
          res.end(result.outputFiles[0].text);
        } catch (e) {
          next(e as any);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [vue(), serveClientJs()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        client: resolve(__dirname, "src/rpc/client.ts"),
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === "client" ? "client.js" : "assets/[name]-[hash].js",
      },
    },
  },
});

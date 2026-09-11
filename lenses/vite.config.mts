import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

const root = resolve(import.meta.dirname, "src");

export default defineConfig({
  root,
  // Portable as a directory on localhost, GitHub Pages, or a versioned CDN.
  base: "./",
  plugins: [
    vue({
      template: {
        compilerOptions: {
          isCustomElement: (tag) => tag === "sw-transclude",
        },
      },
    }),
  ],
  build: {
    outDir: resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    minify: false,
    cssMinify: false,
    rollupOptions: {
      input: {
        index: resolve(root, "index.html"),
        view: resolve(root, "view/index.html"),
        edit: resolve(root, "edit/index.html"),
        history: resolve(root, "history/index.html"),
      },
    },
  },
  preview: { cors: true },
});

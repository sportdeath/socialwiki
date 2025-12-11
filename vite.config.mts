import { defineConfig } from "vite";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [
    vue(),
    nodePolyfills({
      include: ["events"],
    }),
  ],
  base: "/socialwiki/",
});

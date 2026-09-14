import { rm } from "node:fs/promises";

import { build } from "vite";
import { buildConfig } from "./vite.config.mts";

const watch = process.argv.includes("--watch");

await rm(new URL("./dist/", import.meta.url), { recursive: true, force: true });

// The browser is a conventional application. Each publishable lens gets a
// separate build so Vite cannot factor its implementation into shared chunks.
for (const [entry, standalone] of [
  ["index", false],
  ["view", true],
  ["edit", true],
  ["history", true],
] as const) {
  await build({
    configFile: false,
    ...buildConfig(entry, standalone, watch),
  });
}

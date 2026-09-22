import { rm } from "node:fs/promises";

import { build } from "vite";
import { buildConfig, locatorBuildConfig } from "./vite.config.mts";

const watch = process.argv.includes("--watch");

await rm(new URL("./dist/", import.meta.url), { recursive: true, force: true });

// Each editable document gets a separate build so Vite cannot factor its
// implementation into shared chunks. Each becomes an independent HTML file,
// which users can edit within the app itself.
for (const entry of ["index", "browser", "view", "edit", "history"] as const) {
  await build({
    configFile: false,
    ...buildConfig(entry, watch),
  });
}

// Every lens uses this stable classic script to locate its own distribution.
await build({
  configFile: false,
  ...locatorBuildConfig(watch),
});

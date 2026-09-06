import { cp, mkdir, readdir, rm, symlink } from "node:fs/promises";

const distribution = new URL("./dist/", import.meta.url);
const kernel = new URL("./kernel/dist/", import.meta.url);
const lenses = new URL("./lenses/dist/", import.meta.url);
const link = process.argv.includes("--link");

await rm(distribution, { recursive: true, force: true });
await mkdir(distribution, { recursive: true });

for (const source of [kernel, lenses]) {
  for (const entry of await readdir(source, { withFileTypes: true })) {
    const from = new URL(entry.name, source);
    const to = new URL(entry.name, distribution);

    if (link) {
      await symlink(from, to, entry.isDirectory() ? "dir" : "file");
    } else {
      await cp(from, to, { recursive: true });
    }
  }
}

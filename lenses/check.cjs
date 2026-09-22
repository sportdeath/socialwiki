// Resolve this workspace's TypeScript, not the kernel's hoisted TypeScript 7.
require("vue-tsc").run(require.resolve("typescript/lib/tsc"));

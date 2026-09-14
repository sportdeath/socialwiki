// Standalone lens modules are inlined in a directory below init.js.
const moduleUrl = import.meta.url;
export const distributionUrl = new URL("../", moduleUrl);

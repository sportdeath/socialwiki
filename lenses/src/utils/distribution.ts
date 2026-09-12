// Compiled lens modules live in assets/, one level below init.js and the HTML.
const moduleUrl = import.meta.url;
export const distributionUrl = new URL("../", moduleUrl);

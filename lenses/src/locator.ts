/*! Locate this Social.Wiki lens distribution independently of the kernel. */
const currentScript = document.currentScript;
if (!(currentScript instanceof HTMLScriptElement) || !currentScript.src) {
  throw new Error("The Social.Wiki lens locator must run as a classic script");
}

window.socialWikiLensesUrl = new URL("./", currentScript.src).href;

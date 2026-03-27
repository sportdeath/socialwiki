import TwoPaneLayout from "./TwoPaneLayout.vue";
import twoPaneLayoutCss from "./TwoPaneLayout.css?inline";

const STYLE_ID = "sw-two-pane-layout-style";

// Standalone lens HTML runs from srcdoc/blob and can miss stylesheet links in
// some browser/sandbox combinations. Inject once from the shared module.
function ensureTwoPaneStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = twoPaneLayoutCss;
  document.head.append(style);
}

ensureTwoPaneStyles();

export default TwoPaneLayout;

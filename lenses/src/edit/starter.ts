import html from "./starter.html?raw";
import { escapeHtml } from "@vue/shared";
import { distributionUrl } from "../utils/distribution";

export function starterHtml(pageName: string) {
  // The page name is a JavaScript string inside an HTML attribute.
  const values = {
    __INIT_URL__: new URL("init.js", distributionUrl).href,
    __PAGE_NAME__: JSON.stringify(pageName),
  };
  return html.replace(/__INIT_URL__|__PAGE_NAME__/g, (key) =>
    escapeHtml(values[key as keyof typeof values]),
  );
}

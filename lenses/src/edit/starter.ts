import html from "./starter.html?raw";
import { escapeHtml } from "@vue/shared";
import { lensesUrl } from "../utils/locator";

export function starterHtml(siteName: string) {
  // The site name is a JavaScript string inside an HTML attribute.
  const values = {
    __INIT_URL__: new URL("init.js", lensesUrl).href,
    __SITE_NAME__: JSON.stringify(siteName),
  };
  return html.replace(/__INIT_URL__|__SITE_NAME__/g, (key) =>
    escapeHtml(values[key as keyof typeof values]),
  );
}

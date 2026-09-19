import {
  composeAddress,
  composeQuery,
  parseAddress,
  parseQuery,
} from "../../route";
import { resolveChildNavigation } from "./document-route";

/** Apply navigation which no containing-document handler consumed. */
export function handleDefaultNavigation(
  element: HTMLElement,
  to: string,
) {
  const route = element.getAttribute("route");
  const routedTo = resolveChildNavigation(
    route === null ? undefined : route,
    to,
  );
  if (routedTo !== null) {
    window.navigate(routedTo);
    return;
  }
  if (!to.startsWith("?")) return;

  // An unrouted side transclusion keeps relative navigation local. Updating
  // its public state uses the ordinary resolution/rendering path.
  const src = element.getAttribute("src");
  if (src !== null) {
    const sourceQuery = src.startsWith("?")
      ? src
      : composeQuery(undefined, src);
    const { params, address } = parseQuery(sourceQuery);
    if (address === undefined) return;
    const { name } = parseAddress(address);
    element.setAttribute(
      "src",
      composeQuery(params, composeAddress(name, to)),
    );
  } else if (element.hasAttribute("srcdoc")) {
    element.setAttribute("query", to);
  }
}

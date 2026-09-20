import { resolveChildNavigation } from "./document-route";
import type { NavigableTransclude } from "./shared";

/** Apply navigation which no containing-document handler consumed. */
export function handleDefaultNavigation(
  transclude: NavigableTransclude,
  to: string,
) {
  const route = transclude.getAttribute("route");

  // Without a public route, this is a side transclusion. It can apply a
  // relative query to its own src/query, but it has nowhere to send root or
  // external navigation by default.
  if (route === null) {
    if (to.startsWith("?")) transclude.navigate(to);
    return;
  }

  // A routed transclusion sends navigation outward. Its route either passes
  // the destination through or places a relative query at the child's public
  // location before the containing document handles it.
  const routedTo = resolveChildNavigation(route, to);
  if (routedTo !== null) window.navigate(routedTo);
}

import * as route from "../../route";
import {
  createDocumentRouteState,
  isDocumentRoute,
  type DocumentRoute,
} from "./document-route";
import { serializeRouteUrl } from "./route-serialization";
import type { EventsChild } from "../events/child";
import {
  NAVIGATE_EVENT,
  NAVIGATION_READY_EVENT,
  QUERY_EVENT,
  handleNavigation,
} from "./shared";

export function installNavigationChild(events: EventsChild) {
  window.route = route;
  window.handleNavigation = handleNavigation;
  window.navigate = (to: string) => events.emit(NAVIGATE_EVENT, { to });

  let currentAddress: string | undefined;
  let currentParamsSerialized: string | undefined;
  const documentRoute = createDocumentRouteState();

  function normalizeParams(params?: URLSearchParams | string): string {
    if (params === undefined) return "";
    const serialized =
      params instanceof URLSearchParams ? params.toString() : String(params);
    return serialized.startsWith("?") ? serialized : `?${serialized}`;
  }

  function updateQueryState(
    params?: URLSearchParams | string,
    address?: string,
  ) {
    const paramsSerialized = normalizeParams(params);

    const didAddressChange = currentAddress !== address;
    const didParamsChange = currentParamsSerialized !== paramsSerialized;

    // Commit the complete query before notifying observers so every change
    // listener sees one coherent address/params pair.
    currentAddress = address;
    currentParamsSerialized = paramsSerialized;

    if (didParamsChange) {
      window.dispatchEvent(new Event("paramschange"));
    }
    if (didAddressChange) {
      window.dispatchEvent(new Event("addresschange"));
    }
    if (didAddressChange || didParamsChange) {
      window.dispatchEvent(new Event("querychange"));
    }

    return { didAddressChange, didParamsChange };
  }

  function currentQuery() {
    return route.composeQuery(
      currentParamsSerialized
        ? new URLSearchParams(currentParamsSerialized)
        : undefined,
      currentAddress,
    );
  }

  function navigateForQueryChange() {
    window.navigate(currentQuery());
  }

  function applyQueryChange(query: string) {
    const { params, address } = route.parseQuery(query);
    const { didAddressChange, didParamsChange } = updateQueryState(
      params,
      address,
    );
    if (didAddressChange || didParamsChange) navigateForQueryChange();
  }

  const paramsMutators = new Set(["append", "delete", "set", "sort"]);

  function applyParamsChange(params?: URLSearchParams | string) {
    const { didParamsChange } = updateQueryState(params, currentAddress);
    if (!didParamsChange) return;
    navigateForQueryChange();
  }

  function createParamsProxy() {
    const params = new URLSearchParams(currentParamsSerialized);

    return new Proxy(params, {
      get: (target, prop) => {
        const value = Reflect.get(target, prop, target);
        if (typeof value !== "function") return value;

        if (typeof prop === "string" && paramsMutators.has(prop)) {
          return (...args: unknown[]) => {
            const previous = target.toString();
            const result = Reflect.apply(
              value as (...args: unknown[]) => unknown,
              target,
              args,
            );
            if (target.toString() !== previous) {
              applyParamsChange(target);
            }
            return result;
          };
        }

        return (value as (...args: unknown[]) => unknown).bind(target);
      },
    });
  }

  Object.defineProperties(window, {
    query: {
      configurable: true,
      get: currentQuery,
      set: (value: string) => applyQueryChange(String(value)),
    },
    address: {
      configurable: true,
      get: () => currentAddress,
      set: (value?: string) => {
        const nextAddress = value === undefined ? value : String(value);
        const { didAddressChange } = updateQueryState(
          currentParamsSerialized,
          nextAddress,
        );
        if (!didAddressChange) return;
        navigateForQueryChange();
      },
    },
    params: {
      configurable: true,
      get: () => createParamsProxy(),
      set: (value?: URLSearchParams | string) => applyParamsChange(value),
    },
  });

  events.listen(QUERY_EVENT, (event) => {
    event.preventDefault();
    const payload = event.detail;
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (typeof p.query !== "string") return;

    // A document route provides context for links, but is not required to
    // deliver the query which tells this transclusion what to display. Its
    // omission deliberately clears any route previously assigned to the frame.
    if (
      p.documentRoute !== undefined &&
      !isDocumentRoute(p.documentRoute)
    ) return;
    documentRoute.setDocumentRoute(p.documentRoute);

    const { params, address } = route.parseQuery(p.query);
    // Parent updates are observations, not new navigation requests. Updating
    // the underlying state directly avoids echoing the query back upward.
    updateQueryState(params, address);
  });

  // The parent endpoint is installed after the iframe is inserted. Announcing
  // readiness on load guarantees it is listening before sending initial state.
  const announceReady = () => events.emit(NAVIGATION_READY_EVENT);
  if (document.readyState === "complete") announceReady();
  else window.addEventListener("load", announceReady, { once: true });

  // We will be selecting links in order to re-write their hrefs
  // to serialize them (which is necessary for unicode).
  const linkSelector = "a[href], area[href]";
  type LinkElement = HTMLAnchorElement | HTMLAreaElement | SVGAElement;
  function isLinkElement(element: EventTarget): element is LinkElement {
    return element instanceof Element && element.matches(linkSelector);
  }

  // Get the link out of an event (a click event, pointerdown event, etc.)
  // This gets the link even if the actual element is nested or in the shadow DOM.
  function eventLink(event: Event): LinkElement | undefined {
    // composedPath retains the actual link across open shadow boundaries,
    // whereas event.target may be retargeted to the shadow host.
    const pathLink = event.composedPath().find(isLinkElement);
    if (pathLink) return pathLink;

    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest(linkSelector);
    return link && isLinkElement(link) ? link : undefined;
  }

  // Keep track of links that have already been serialized
  // so that they are not double-encoded
  const preparedLinks = new WeakMap<
    LinkElement,
    {
      sourceHref: string;
      canonicalHref: string;
      documentRoute?: DocumentRoute;
    }
  >();

  // Turn the href of a link element into a properly serialized URL
  function canonicalizeRouteLink(link: LinkElement) {
    // Don't serialize downloads, just normal links
    if (link.hasAttribute("download")) return;
    const authoredHref = link.getAttribute("href");
    if (typeof authoredHref !== "string") return;

    // Hover, pointerdown, and contextmenu may all precede click. Keep
    // preparation idempotent while retaining the authored href for bridge
    // navigation.
    const prepared = preparedLinks.get(link);
    const currentDocumentRoute = documentRoute.getDocumentRoute();
    if (
      prepared?.canonicalHref === authoredHref &&
      prepared.documentRoute?.rootUrl === currentDocumentRoute?.rootUrl &&
      prepared.documentRoute?.queryRootUrl ===
        currentDocumentRoute?.queryRootUrl &&
      prepared.documentRoute?.address === currentDocumentRoute?.address
    ) {
      return prepared.sourceHref;
    }
    const sourceHref =
      prepared?.canonicalHref === authoredHref
        ? prepared.sourceHref
        : authoredHref;

    try {
      if (!currentDocumentRoute) {
        // Removing a transclude's route turns it into a side transclusion.
        // Restore any href serialized under its previous route so native
        // new-tab actions do not retain stale parent context.
        if (prepared?.canonicalHref === authoredHref) {
          link.setAttribute("href", sourceHref);
          preparedLinks.delete(link);
        }
        return sourceHref;
      }
      const destination = serializeRouteUrl(sourceHref, currentDocumentRoute);
      if (!destination) {
        preparedLinks.delete(link);
        return sourceHref;
      }

      const canonicalHref = destination.href;
      preparedLinks.set(link, {
        sourceHref,
        canonicalHref,
        documentRoute: currentDocumentRoute,
      });
      link.setAttribute("href", canonicalHref);
      return sourceHref;
    } catch {
      // Malformed links are left to native browser behavior.
      return sourceHref;
    }
  }

  // Prepare native new-tab/window paths before the browser opens its context
  // menu or handles a middle click. Neither event is consumed.
  const prepareNativeLink = (event: Event) => {
    const link = eventLink(event);
    if (link) canonicalizeRouteLink(link);
  };
  document.addEventListener("mouseover", prepareNativeLink);
  document.addEventListener("pointerdown", prepareNativeLink);
  document.addEventListener("contextmenu", prepareNativeLink);

  // When a link is clicked, intercept the navigation to use window.navigate
  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;

    const link = eventLink(e);
    if (!link) return;

    // Downloads remain native. Other ordinary clicks use the bridge because
    // the sandbox cannot reliably navigate explicit ancestor targets.
    if (link.hasAttribute("download")) return;
    const href = link.getAttribute("href");
    if (typeof href !== "string") return;

    // Native fragments in srcdoc resolve against the containing document's
    // base URL and can reload that parent inside this frame. Scroll locally
    // instead. `#/...` remains an absolute Social.Wiki route.
    if (href.startsWith("#") && !href.startsWith("#/")) {
      e.preventDefault();
      const encodedName = href.slice(1);
      if (!encodedName) {
        document.documentElement.scrollIntoView();
        return;
      }
      let name = encodedName;
      try {
        name = decodeURIComponent(encodedName);
      } catch {
        // Match the literal fragment when it is not valid percent encoding.
      }
      const target =
        document.getElementById(name) ?? document.getElementsByName(name)[0];
      target?.scrollIntoView();
      return;
    }

    // This also covers keyboard-generated clicks without a preceding pointer
    // or context-menu event.
    const navigationHref = canonicalizeRouteLink(link) ?? href;

    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    // The sandbox explicitly permits user-initiated popups, so preserve the
    // most common declarative new-tab behavior instead of routing it in-place.
    const target =
      link.getAttribute("target") ??
      document.querySelector("base[target]")?.getAttribute("target");
    if (target?.trim().toLowerCase() === "_blank") return;

    // Give containing documents the first opportunity to handle every normal
    // click. Otherwise, the containing transclude applies its route default;
    // only an unrouted side transclusion limits its fallback to relative queries.
    e.preventDefault();
    window.navigate(navigationHref);
  });

  return documentRoute;
}

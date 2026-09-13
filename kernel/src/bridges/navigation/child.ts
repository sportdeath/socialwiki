import * as route from "../../route";
import type { EventsChild } from "../events/child";
import {
  BASE_URL_RESPONSE_EVENT,
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

    const { params, address } = route.parseQuery(p.query);
    // Parent updates are observations, not new navigation requests. Updating
    // the underlying state directly avoids echoing the query back upward.
    updateQueryState(params, address);
  });

  // The base is stable document context, independent of resolution and query
  // changes. Keep it as a promise so early descendants can wait for and then
  // inherit its effective value without a separate initialization phase.
  const inheritedBaseUrl = new Promise<string>((resolve) => {
    const stopListening = events.listen(BASE_URL_RESPONSE_EVENT, (event) => {
      event.preventDefault();
      const payload = event.detail;
      if (typeof payload !== "object" || payload === null) return;
      const p = payload as Record<string, unknown>;
      if (typeof p.baseUrl !== "string") return;

      // A browser-like document may establish its own navigation context.
      // Otherwise inherit the containing browser's base, not our resource URL.
      const baseElement =
        document.querySelector<HTMLBaseElement>("base[href]") ??
        document.createElement("base");
      let url: URL;
      try {
        url = new URL(baseElement.getAttribute("href") ?? p.baseUrl, p.baseUrl);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;

      const baseUrl = url.href;
      // Social.Wiki documents are originless and must use absolute URLs for
      // resources. This base exists only for native link resolution.
      baseElement.href = baseUrl;
      document.head.prepend(baseElement);
      stopListening();
      resolve(baseUrl);
    });
  });

  // The parent endpoint is installed after the iframe is inserted. Announcing
  // readiness on load guarantees it is listening before sending initial state.
  const announceReady = () => events.emit(NAVIGATION_READY_EVENT);
  if (document.readyState === "complete") announceReady();
  else window.addEventListener("load", announceReady, { once: true });

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = e.target;
    if (!(target instanceof Element)) return;

    const a = target.closest("a[href]");
    if (!(a instanceof HTMLAnchorElement)) return;

    // Downloads remain native. Other ordinary clicks use the bridge because
    // the sandbox cannot reliably navigate explicit ancestor targets.
    if (a.hasAttribute("download")) return;
    const href = a.getAttribute("href");
    if (typeof href !== "string") return;

    e.preventDefault();
    window.navigate(href);
  });

  return inheritedBaseUrl;
}

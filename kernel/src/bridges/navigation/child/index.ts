import { composeQuery, parseQuery } from "../../../route";
import type { EventsChild } from "../../events/child";
import {
  BASE_URL_REQUEST_EVENT,
  BASE_URL_RESPONSE_EVENT,
  NAVIGATE_EVENT,
  QUERY_EVENT,
  handleNavigation,
} from "../shared";

export function installNavigationChild(events: EventsChild) {
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
    if (!didAddressChange && !didParamsChange) {
      return { didAddressChange, didParamsChange };
    }

    currentAddress = address;
    currentParamsSerialized = paramsSerialized;

    if (didParamsChange) {
      window.dispatchEvent(new Event("paramschange"));
    }
    if (didAddressChange) {
      window.dispatchEvent(new Event("addresschange"));
    }

    return { didAddressChange, didParamsChange };
  }

  function currentQuery() {
    return composeQuery(
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
    const { params, address } = parseQuery(query);
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

  events.listen(QUERY_EVENT, (payload) => {
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (typeof p.query !== "string") return;

    const { params, address } = parseQuery(p.query);
    updateQueryState(params, address);
  });

  const inheritedBaseUrl = new Promise<string>((resolve) => {
    const stopListening = events.listen(BASE_URL_RESPONSE_EVENT, (payload) => {
      if (typeof payload !== "object" || payload === null) return;
      const p = payload as Record<string, unknown>;
      if (typeof p.baseUrl !== "string") return;

      let url: URL;
      try {
        url = new URL(p.baseUrl);
      } catch {
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") return;

      const baseUrl = url.href;
      // Social.Wiki documents are originless and must use absolute URLs for
      // resources. This base exists only for links and navigation.
      const baseElement = document.createElement("base");
      baseElement.href = baseUrl;
      document.head.prepend(baseElement);
      stopListening();
      resolve(baseUrl);
    });
  });

  // The parent endpoint is installed after the iframe is inserted. Requesting
  // on load guarantees it is listening without introducing a ready handshake.
  const requestBaseUrl = () => events.emit(BASE_URL_REQUEST_EVENT);
  if (document.readyState === "complete") requestBaseUrl();
  else window.addEventListener("load", requestBaseUrl, { once: true });

  document.addEventListener("click", (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = e.target;
    if (!(target instanceof Element)) return;

    const a = target.closest("a[href]");
    if (!(a instanceof HTMLAnchorElement)) return;

    // TODO: what about target="_blank" or target="_top"?
    if (a.hasAttribute("download") || (a.target && a.target !== "_self")) {
      return;
    }
    const href = a.getAttribute("href");
    if (typeof href !== "string") return;

    e.preventDefault();
    window.navigate(href);
  });

  return inheritedBaseUrl;
}

import { composeQuery, parseQuery } from "./route";

declare global {
  interface Window {
    navigate: (to: string) => void;
    params?: URLSearchParams;
    address?: string;
  }
}

export function installNavigation(origin: string) {
  window.navigate = (to: string) => {
    window.emit("sw-navigate", { to });
  };

  let currentAddress: string | undefined = undefined;
  let currentParamsSerialized: string | undefined = undefined;

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

  function navigateForQueryChange() {
    const to = composeQuery(
      new URLSearchParams(currentParamsSerialized),
      currentAddress,
    );
    window.navigate(to);
    return;
  }

  const paramsMutators = new Set(["append", "delete", "set", "sort"]);

  function applyParamsChange(params?: URLSearchParams | string) {
    const nextParamsSerialized = normalizeParams(params);
    const { didParamsChange } = updateQueryState(
      nextParamsSerialized,
      currentAddress,
    );
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

  window.addEventListener("sw-query", (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const payload = event.detail;
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (typeof p.query !== "string") return;

    const { params, address } = parseQuery(p.query);
    updateQueryState(params, address);
  });

  const base = document.createElement("base");
  base.href = origin;
  document.head.append(base);

  document.addEventListener("click", (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = e.target;
    if (!(target instanceof Element)) return;

    const a = target.closest("a[href]");
    if (!(a instanceof HTMLAnchorElement)) return;

    if (a.hasAttribute("download")) return;
    const href = a.getAttribute("href");
    if (typeof href !== "string") return;

    e.preventDefault();
    window.navigate(href);
  });
}

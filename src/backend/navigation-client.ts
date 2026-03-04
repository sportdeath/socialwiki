import { composeFragment, parseFragment } from "./route";

declare global {
  interface Window {
    navigate: (to: string, top?: boolean) => void;
    params: URLSearchParams;
    address: string;
  }
}

export function installNavigation(origin: string) {
  window.navigate = (to: string, top = false) => {
    window.emit("sw-navigate", { to, top });
  };

  let currentAddress = "";
  let currentParamsSerialized = "";

  function normalizeParams(params: URLSearchParams | string): string {
    const serialized =
      params instanceof URLSearchParams ? params.toString() : String(params);
    return serialized.startsWith("?") ? serialized.slice(1) : serialized;
  }

  function updateFragmentState(
    params: URLSearchParams | string,
    address: string,
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

  function navigateForFragmentChange() {
    const to = `#${composeFragment(
      new URLSearchParams(currentParamsSerialized),
      currentAddress,
    )}`;
    window.navigate(to);
    return;
  }

  Object.defineProperties(window, {
    address: {
      configurable: true,
      get: () => currentAddress,
      set: (value: string) => {
        const nextAddress = String(value);
        const { didAddressChange } = updateFragmentState(
          currentParamsSerialized,
          nextAddress,
        );
        if (!didAddressChange) return;
        navigateForFragmentChange();
      },
    },
    params: {
      configurable: true,
      get: () => new URLSearchParams(currentParamsSerialized),
      set: (value: URLSearchParams | string) => {
        const nextParamsSerialized = normalizeParams(value);
        const { didParamsChange } = updateFragmentState(
          nextParamsSerialized,
          currentAddress,
        );
        if (!didParamsChange) return;
        navigateForFragmentChange();
      },
    },
  });

  window.addEventListener("sw-fragment", (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const payload = event.detail;
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (typeof p.fragment !== "string") return;

    const { params, address } = parseFragment(p.fragment);
    updateFragmentState(params, address);
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

    e.preventDefault();
    window.navigate(a.href, a.target === "_top");
  });
}

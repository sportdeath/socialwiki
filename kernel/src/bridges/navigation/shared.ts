export const NAVIGATE_EVENT = "sw-navigate";
export const QUERY_EVENT = "sw-query";
export const BASE_URL_REQUEST_EVENT = "sw-base-url-request";
export const BASE_URL_RESPONSE_EVENT = "sw-base-url-response";

declare global {
  interface Window {
    navigate: (to: string) => void;
    handleNavigation: typeof handleNavigation;

    /**
     * The complete query derived from `params` and `address`. For example,
     * params `mode=compact` and address `alice` compose to
     * `?mode=compact/alice`; empty params and address `alice` compose to
     * `?/alice`.
     *
     * Assigning a query parses it back into `params` and `address`, dispatches
     * their change events as appropriate, and requests navigation.
     */
    get query(): string;
    set query(value: string);

    /**
     * Parameters for the current document: the part of its query between `?`
     * and the first `/`. For `?mode=compact&sort=new/alice`, `params` contains
     * `mode=compact` and `sort=new`. For `?/alice`, it is empty.
     *
     * Assigning this property, or mutating the returned URLSearchParams with
     * append/delete/set/sort, requests navigation to the resulting query.
     * A changed value received from the parent dispatches `paramschange`.
     */
    get params(): URLSearchParams;
    set params(value: URLSearchParams | string | undefined);

    /**
     * The address delegated to whatever the current document displays: all
     * text after the query's first `/`, without that slash. For `?/alice`, it
     * is `alice`; for `?/v?/alice`, it is `v?/alice`; and for `?mode=compact`
     * it is undefined.
     *
     * Assigning this property requests navigation to the resulting query.
     * A changed value received from the parent dispatches `addresschange`.
     */
    get address(): string | undefined;
    set address(value: string | undefined);
  }
}

export function handleNavigation(
  onNavigate: (to: string, source: HTMLElement) => void,
) {
  const listener = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const payload = event.detail;
    if (typeof payload !== "object" || payload === null) return;
    const { to } = payload as Record<string, unknown>;
    if (typeof to !== "string" || !(event.target instanceof HTMLElement)) {
      return;
    }

    event.stopImmediatePropagation();
    onNavigate(to, event.target);
  };
  window.addEventListener(NAVIGATE_EVENT, listener);
  return () => window.removeEventListener(NAVIGATE_EVENT, listener);
}

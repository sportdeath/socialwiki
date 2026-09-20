export const NAVIGATE_EVENT = "sw-navigate";
export const NAVIGATION_READY_EVENT = "sw-navigation-ready";
export const QUERY_EVENT = "sw-query";

/**
 * Query state is observable through ordinary Window events:
 *
 * ```ts
 * const onQueryChange = () => render(window.query);
 * window.addEventListener("querychange", onQueryChange);
 * ```
 *
 * There are also `paramschange` and `addresschange` to watch
 * individual query components (see ../../route).
 */
declare global {
  interface WindowEventMap {
    querychange: Event;
    paramschange: Event;
    addresschange: Event;
  }

  interface Window {
    /** Pure helpers for parsing and composing Social.Wiki routes. */
    route: typeof import("../../route");

    /**
     * Requests navigation from the containing document. `to` is emitted
     * unchanged so each ancestor may interpret, rewrite, or forward it. If no
     * handler does, the containing transclusion applies its `route` default.
     */
    navigate: (to: string) => void;

    /**
     * Replaces the default handling of navigation from this document's
     * transclusions. The handler receives the requesting transclusion, whose
     * `navigate()` method applies relative navigation locally; it may instead
     * forward a request upward with `window.navigate()`. Returns a function
     * which removes the handler.
     */
    handleNavigation: typeof handleNavigation;

    /**
     * The complete query derived from `params` and `address`. For example,
     * params `mode=compact` and address `alice` compose to
     * `?mode=compact/alice`; empty params and address `alice` compose to
     * `?/alice`.
     *
     * Assigning a query parses it back into `params` and `address`, dispatches
     * their change events plus one `querychange`, and requests navigation.
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
     * Whenever the value changes, Window dispatches `paramschange`.
     */
    get params(): URLSearchParams;
    set params(value: URLSearchParams | string | undefined);

    /**
     * The address delegated to whatever the current document displays: all
     * text after the query's first `/`, without that slash. For `?/alice`, it
     * is `alice`; for `?/v?/alice`, it is `v?/alice`; and for `?mode=compact`
     * it is undefined.
     *
     * Each document name within an address cannot contain `?`, because `?`
     * separates that name from the query delegated to the document.
     *
     * Assigning this property requests navigation to the resulting query.
     * Whenever the value changes, Window dispatches `addresschange`.
     */
    get address(): string | undefined;
    set address(value: string | undefined);
  }
}

/** The part of a transclusion used by the navigation bridge. */
export interface NavigableTransclude extends HTMLElement {
  /** Apply a relative navigation within this transcluded document. */
  navigate(to: string): void;
}

type NavigationHandler = (
  to: string,
  transclude: NavigableTransclude,
) => void;
let navigationHandler: NavigationHandler | undefined;

export function handleNavigation(
  onNavigate: NavigationHandler,
) {
  navigationHandler = onNavigate;
  return () => {
    if (navigationHandler === onNavigate) navigationHandler = undefined;
  };
}

/** Use this document's handler, or the requesting transclusion's fallback. */
export function dispatchNavigation(
  to: string,
  transclude: NavigableTransclude,
  fallback: () => void,
) {
  if (navigationHandler) navigationHandler(to, transclude);
  else fallback();
}

import "@iframe-resizer/child";
import type { EventsChild } from "../events/child";
import {
  AUTOSIZE_FALLBACK_EVENT,
  AUTOSIZE_MODE_EVENT,
  type AutosizeContext,
  type AutosizeMode,
  autosizesHeight,
  autosizesWidth,
  parseAutosizeMode,
} from "./shared";

export function installAutosizeChild(events: EventsChild): AutosizeContext {
  // v5's automatic width mode can miss overflow outside the html box and
  // late width-only style changes. Keep its scroll measurement for width;
  // the library still owns change detection and height measurement.
  Object.assign(window.iFrameResizer ??= {}, { widthCalculationMethod: "scroll" });
  let mode: AutosizeMode = "off";
  let fallback = { x: false, y: false };
  const modeListeners = new Set<(mode: AutosizeMode) => void>();
  const rootStyle = document.documentElement.style;
  const saved = new WeakMap<CSSStyleDeclaration, Map<string, { value: string; priority: string; owned: string }>>();

  const ownStyle = (style: CSSStyleDeclaration, property: string, value: string | null) => {
    let properties = saved.get(style);
    const previous = properties?.get(property);
    const current = style.getPropertyValue(property);
    const priority = style.getPropertyPriority(property);
    if (previous && (current !== previous.owned || priority !== "important")) {
      previous.value = current;
      previous.priority = priority;
    }
    if (value === null) {
      if (!previous) return;
      if (previous.value) style.setProperty(property, previous.value, previous.priority);
      else style.removeProperty(property);
      properties?.delete(property);
    } else {
      if (!previous) {
        if (!properties) saved.set(style, properties = new Map());
        properties.set(property, { value: current, priority, owned: value });
      }
      else previous.owned = value;
      if (current !== value || priority !== "important") style.setProperty(property, value, "important");
    }
  };

  const setOverflow = () => {
    ownStyle(rootStyle, "overflow-x", autosizesWidth(mode) ? (fallback.x ? "auto" : "clip") : null);
    ownStyle(rootStyle, "overflow-y", autosizesHeight(mode) ? (fallback.y ? "auto" : "clip") : null);

    const body = document.body;
    if (!body) return;
    const bodyStyle = body.style;
    const fittedHeight = autosizesHeight(mode) && !fallback.y;
    // overflow-x:hidden turns an otherwise visible vertical body overflow
    // into auto. Use clip for the hidden horizontal axis so the body does not
    // become an independent vertical wheel target.
    const hiddenX = getComputedStyle(body).overflowX === "hidden" ||
      saved.get(bodyStyle)?.has("overflow-x");
    ownStyle(bodyStyle, "overflow-x", fittedHeight && hiddenX ? "clip" : null);
  };

  events.listen(AUTOSIZE_FALLBACK_EVENT, (event) => {
    event.preventDefault();
    const value = event.detail;
    if (typeof value !== "object" || value === null) return;
    const axes = value as Record<string, unknown>;
    if (typeof axes.x !== "boolean" || typeof axes.y !== "boolean") return;
    fallback = { x: axes.x, y: axes.y };
    setOverflow();
  });
  events.listen(AUTOSIZE_MODE_EVENT, (event) => {
    event.preventDefault();
    mode = parseAutosizeMode(event.detail);
    setOverflow();
    for (const listener of modeListeners) listener(mode);
    window.dispatchEvent(new CustomEvent(AUTOSIZE_MODE_EVENT, { detail: mode }));
  });
  new MutationObserver(setOverflow).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["style"],
  });

  return {
    get mode() { return mode; },
    subscribe(listener) {
      modeListeners.add(listener);
      return () => modeListeners.delete(listener);
    },
  };
}

import type { EventsChild } from "../events/child";
import {
  AUTOSIZE_FALLBACK_EVENT,
  AUTOSIZE_MODE_EVENT,
  AUTOSIZE_SIZE_EVENT,
  type AutosizeContext,
  type AutosizeMode,
  autosizesHeight,
  autosizesWidth,
  parseAutosizeMode,
} from "./shared";

export function installAutosizeChild(events: EventsChild): AutosizeContext {
  let mode: AutosizeMode = "off";
  const modeListeners = new Set<(mode: AutosizeMode) => void>();
  let resizeObserver: ResizeObserver | null = null;
  let observedBody: HTMLElement | null = null;
  let timerId: number | null = null;
  let lastWidth = -1;
  let lastHeight = -1;
  let lastBodyScrollHeight = -1;
  let fallback = { x: false, y: false };

  const observeBody = () => {
    // body may appear after the bridge is installed; observe lazily.
    if (!resizeObserver || !document.body || observedBody === document.body) return;
    if (observedBody) resizeObserver.unobserve(observedBody);
    observedBody = document.body;
    resizeObserver.observe(observedBody);
  };

  const parsePx = (value: string) => {
    // Computed lengths are in px; an auto margin is viewport allocation, not
    // extra intrinsic space to add to the reported size.
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  };

  const measureIntrinsicBodySize = () => {
    const doc = document.documentElement;
    const body = document.body;

    if (!body) {
      return {
        width: Math.max(1, Math.ceil(doc.clientWidth)),
        height: Math.max(1, Math.ceil(doc.clientHeight)),
      };
    }

    const style = window.getComputedStyle(body);
    const bodyRect = body.getBoundingClientRect();
    const marginX = parsePx(style.marginLeft) + parsePx(style.marginRight);
    const marginY = parsePx(style.marginTop) + parsePx(style.marginBottom);
    const paddingRight = parsePx(style.paddingRight);
    const paddingBottom = parsePx(style.paddingBottom);
    let width = parsePx(style.paddingLeft);

    // Element boxes below handle their own text. Only range-measure direct
    // text nodes: a range over the whole body includes closed <details> text.
    for (const node of body.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      // Range width alone omits the body's left padding before direct text.
      width = Math.max(width, rect.right - bodyRect.left);
    }

    const measureChildWidth = (child: Element) => {
      const childStyle = window.getComputedStyle(child);
      if (childStyle.position === "fixed") return;
      if (childStyle.display === "contents") {
        for (const descendant of child.children) measureChildWidth(descendant);
        return;
      }
      const rect = child.getBoundingClientRect();
      const boxWidth = child instanceof HTMLElement
        ? Math.max(
          childStyle.overflowX === "visible" ? child.scrollWidth : 0,
          child.offsetWidth,
          child.clientWidth,
        )
        : rect.width;
      // Keep the box's own width for RTL content extending left of the body.
      // A nested clip container contributes only its visible box.
      width = Math.max(
        width,
        boxWidth,
        rect.left - bodyRect.left + boxWidth + parsePx(childStyle.marginRight),
      );
    };
    for (const child of body.children) measureChildWidth(child);
    // Generated content has no DOM box to visit. Use scrollWidth only when it
    // exceeds the stretched body's viewport width, so narrow pages can shrink.
    if (body.scrollWidth > body.clientWidth) width = Math.max(width, body.scrollWidth);

    // Body scrollHeight follows rendered overflow, including SVG, generated
    // content, and display:contents descendants, while excluding overflow
    // inside nested scroll containers. Unlike root scrollHeight, it can shrink
    // below the current iframe viewport.
    const docTop = doc.getBoundingClientRect().top;
    let documentHeight = Math.max(body.scrollHeight, body.offsetHeight, bodyRect.height) + marginY;
    // Collapsed bottom margins escape body scrollHeight. Include those that
    // remain outside any nested scroll or clip container.
    for (const element of body.querySelectorAll("*")) {
      if (!(element instanceof HTMLElement)) continue;
      const elementStyle = window.getComputedStyle(element);
      const bottomMargin = parsePx(elementStyle.marginBottom);
      if (bottomMargin <= 0 || elementStyle.position === "fixed") continue;
      if (element.getClientRects().length === 0) continue;
      const candidate = element.getBoundingClientRect().bottom - docTop +
        bottomMargin + paddingBottom + parsePx(style.marginBottom);
      if (candidate <= documentHeight) continue;

      // Descendants of a scroll/clip container do not extend the outer page.
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== body) {
        if (window.getComputedStyle(ancestor).overflowY !== "visible") break;
        ancestor = ancestor.parentElement;
      }
      if (!ancestor || ancestor === body) documentHeight = candidate;
    }

    return {
      width: Math.max(1, Math.ceil(width + paddingRight + marginX)),
      height: Math.max(1, Math.ceil(documentHeight)),
    };
  };

  const emitSize = () => {
    // Before parsing finishes, the body can be absent or incomplete. Its
    // viewport-sized fallback is not a meaningful content measurement.
    if (document.readyState === "loading") return;
    observeBody();
    const { width, height } = measureIntrinsicBodySize();
    lastBodyScrollHeight = document.body?.scrollHeight ?? -1;

    if (width === lastWidth && height === lastHeight) return;

    lastWidth = width;
    lastHeight = height;
    events.emit(AUTOSIZE_SIZE_EVENT, { width, height });
  };

  const scheduleEmit = () => {
    if (document.readyState === "loading") return;
    // Coalesce observer/resize events. Timers still run when an offscreen
    // iframe's animation frames are paused, so it can size before scrolling.
    if (timerId !== null) return;
    timerId = window.setTimeout(() => {
      timerId = null;
      emitSize();
    }, 0);
  };

  // ResizeObserver does not report overflow outside a fixed-size body.
  // These events also cover late resources and motion that changes position.
  document.addEventListener("load", scheduleEmit, true);
  document.addEventListener("animationend", scheduleEmit, true);
  document.addEventListener("transitionend", scheduleEmit, true);
  document.fonts?.addEventListener("loadingdone", scheduleEmit);

  // CSSOM rule edits have no mutation event. Check for body overflow changes
  // when the user tries to scroll, without remeasuring on every wheel.
  const checkUnobservedGrowth = () => {
    if (autosizesHeight(mode) && document.body &&
      document.body.scrollHeight !== lastBodyScrollHeight) {
      scheduleEmit();
    }
  };
  document.addEventListener("wheel", checkUnobservedGrowth, { capture: true, passive: true });
  document.addEventListener("touchstart", checkUnobservedGrowth, { capture: true, passive: true });
  document.addEventListener("keydown", (event) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
      checkUnobservedGrowth();
    }
  }, true);

  const rootStyle = document.documentElement.style;
  // Saving at bridge installation or restoring an untouched property would
  // erase styles that the page set later in its own startup code.
  const savedStyles = new Map<string, { value: string; priority: string; owned: string }>();
  const ownStyle = (property: string, value: string | null) => {
    const saved = savedStyles.get(property);
    const current = rootStyle.getPropertyValue(property);
    const priority = rootStyle.getPropertyPriority(property);
    // A page may update its inline style after autosize takes ownership.
    // Remember that author value for restoration, then reassert the fitted mode.
    if (saved && (current !== saved.owned || priority !== "important")) {
      saved.value = current;
      saved.priority = priority;
    }
    if (value === null) {
      if (!saved) return;
      if (saved.value) rootStyle.setProperty(property, saved.value, saved.priority);
      else rootStyle.removeProperty(property);
      savedStyles.delete(property);
    } else {
      if (!saved) {
        savedStyles.set(property, {
          value: current,
          priority,
          owned: value,
        });
      } else saved.owned = value;
      if (current !== value || priority !== "important") {
        rootStyle.setProperty(property, value, "important");
      }
    }
  };
  const setOverflow = () => {
    for (const axis of ["x", "y"] as const) {
      const autosized = axis === "x" ? autosizesWidth(mode) : autosizesHeight(mode);
      const overflow = autosized ? (fallback[axis] ? "auto" : "hidden") : null;
      ownStyle(`overflow-${axis}`, overflow);
    }
    // A horizontal scrollbar steals height from an otherwise fitted iframe.
    // Hide its track while fitted, without disabling horizontal panning.
    ownStyle("scrollbar-width", autosizesHeight(mode) && !fallback.y
      ? "none" : null);
  };
  events.listen(AUTOSIZE_FALLBACK_EVENT, (event) => {
    event.preventDefault();
    const value = event.detail;
    if (typeof value !== "object" || value === null) return;
    const axes = value as Record<string, unknown>;
    if (typeof axes.x !== "boolean" || typeof axes.y !== "boolean") return;
    fallback = { x: axes.x, y: axes.y };
    setOverflow();
    scheduleEmit();
  });
  events.listen(AUTOSIZE_MODE_EVENT, (event) => {
    event.preventDefault();
    mode = parseAutosizeMode(event.detail);
    setOverflow();
    for (const listener of modeListeners) listener(mode);
    // The bridged mode is local to this document. Lenses with custom sizing
    // can observe it without accidentally forwarding it to a nested page.
    window.dispatchEvent(new CustomEvent(AUTOSIZE_MODE_EVENT, { detail: mode }));
    // Removing a scrollbar changes the viewport and can change line wrapping.
    scheduleEmit();
  });

  const startAutosize = () => {
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(scheduleEmit);
      resizeObserver.observe(document.documentElement);
      // Head styles can change visible overflow without resizing the body.
      // Observing the whole document also catches body replacement.
      new MutationObserver((mutations) => {
        if (mutations.some((mutation) => mutation.target === document.documentElement &&
          mutation.attributeName === "style")) setOverflow();
        scheduleEmit();
      }).observe(document.documentElement, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true,
      });
      observeBody();
      window.addEventListener("resize", scheduleEmit);
    }
    scheduleEmit();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startAutosize, { once: true });
  } else {
    startAutosize();
  }

  return {
    get mode() { return mode; },
    subscribe(listener) {
      modeListeners.add(listener);
      return () => modeListeners.delete(listener);
    },
  };
}

import type { EventsChild } from "../events/child";
import {
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
  let timerId: number | null = null;
  let lastWidth = -1;
  let lastHeight = -1;
  // The same feedback check applies to either axis: 100vw plus padding and
  // 100vh plus padding can both grow every time their iframe grows.
  const growthOrigin: Record<"width" | "height", { viewport: number; excess: number } | null> = {
    width: null,
    height: null,
  };

  const observeBody = () => {
    // body may appear after the bridge is installed; observe lazily.
    if (!resizeObserver || !document.body) return;
    resizeObserver.observe(document.body);
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
    let height = parsePx(style.paddingTop);

    // Element boxes below handle their own text. Only range-measure direct
    // text nodes: a range over the whole body includes closed <details> text.
    for (const node of body.childNodes) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      // Range width alone omits the body's left padding before direct text.
      width = Math.max(width, rect.right - bodyRect.left);
      height = Math.max(height, rect.bottom - bodyRect.top);
    }

    for (const child of Array.from(body.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const childStyle = window.getComputedStyle(child);
      if (childStyle.position === "fixed") continue;

      // Offset boxes omit visible overflow. Scroll sizes include it, but also
      // include content deliberately hidden inside a scroll/clip container.
      const childWidth = Math.max(
        childStyle.overflowX === "visible" ? child.scrollWidth : 0,
        child.offsetWidth,
        child.clientWidth,
      );
      const childHeight = Math.max(
        childStyle.overflowY === "visible" ? child.scrollHeight : 0,
        child.offsetHeight,
        child.clientHeight,
      );
      // Keep overflow and the trailing margin separate: auto margins already
      // fill the viewport, so adding internal overflow to them causes growth.
      width = Math.max(
        width,
        child.offsetLeft + childWidth,
        child.offsetLeft + child.offsetWidth + parsePx(childStyle.marginRight),
      );
      // Bottom margins can collapse through ancestors, so the scan below
      // handles them in document coordinates rather than adding one here.
      height = Math.max(height, child.offsetTop + childHeight);
    }

    // A nested element's bottom margin may collapse through its ancestors.
    // It then contributes to document overflow without appearing in their
    // scrollHeight or the range bounds. Measure it in document coordinates so
    // a margin-only change can grow or shrink the frame.
    const docTop = doc.getBoundingClientRect().top;
    // Child offsets include leading body padding, but not trailing padding.
    // Without the latter, a padded lens clips the right and bottom of its page.
    let documentHeight = height + paddingBottom + marginY;
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

  const stabilizeGrowth = (axis: "width" | "height", size: number, previous: number) => {
    const viewport = axis === "width"
      ? document.documentElement.clientWidth
      : document.documentElement.clientHeight;
    if (size <= previous) {
      growthOrigin[axis] = null;
      return size;
    }
    const excess = size - viewport;
    // Compare with the start of this growth run. A viewport-relative layout
    // cannot converge if its excess never falls as the viewport grows. Freeze
    // at the last accepted size rather than chasing 100vw/100vh plus spacing
    // forever. This is a safety stop, not intrinsic sizing for a page whose
    // content depends on the very viewport we are trying to size. Using the
    // start avoids mistaking one rounded pixel for a loop.
    const origin = growthOrigin[axis];
    // After applying a size, the new iframe viewport equals that size. If it
    // differs, an outside resize or box constraint changed the viewport;
    // that is not evidence of a self-sustaining autosize loop.
    if (origin && viewport === previous && viewport > origin.viewport &&
      excess >= origin.excess) return previous;
    // Growth without a larger viewport came from content or late styles;
    // start a new run instead of comparing it with the old layout.
    if (!origin || viewport !== previous || viewport <= origin.viewport) {
      growthOrigin[axis] = { viewport, excess };
    }
    return size;
  };

  const emitSize = () => {
    // Before parsing finishes, the body can be absent or incomplete. Its
    // viewport-sized fallback is not a meaningful content measurement.
    if (document.readyState === "loading") return;
    observeBody();
    const measured = measureIntrinsicBodySize();
    // Shrinks are applied immediately on both axes. Delaying a width shrink
    // until another observer notification can strand a real content change;
    // it also cannot give viewport-relative content an intrinsic width.
    const width = stabilizeGrowth("width", measured.width, lastWidth);
    const height = stabilizeGrowth("height", measured.height, lastHeight);

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

  const rootStyle = document.documentElement.style;
  // Autosized axes must not acquire a scrollbar: its width or height changes
  // the viewport being measured. Take ownership only when an axis is enabled:
  // saving at bridge installation or restoring an untouched axis would erase
  // inline overflow that the page set later in its own startup code.
  const savedOverflow = new Map<string, { value: string; priority: string }>();
  events.listen(AUTOSIZE_MODE_EVENT, (event) => {
    event.preventDefault();
    mode = parseAutosizeMode(event.detail);
    for (const axis of ["x", "y"] as const) {
      const property = `overflow-${axis}`;
      const autosized = axis === "x" ? autosizesWidth(mode) : autosizesHeight(mode);
      if (autosized) {
        if (!savedOverflow.has(property)) {
          savedOverflow.set(property, {
            value: rootStyle.getPropertyValue(property),
            priority: rootStyle.getPropertyPriority(property),
          });
        }
        rootStyle.setProperty(property, "hidden", "important");
      } else {
        const saved = savedOverflow.get(property);
        if (!saved) continue;
        if (saved.value) rootStyle.setProperty(property, saved.value, saved.priority);
        else rootStyle.removeProperty(property);
        savedOverflow.delete(property);
      }
    }
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

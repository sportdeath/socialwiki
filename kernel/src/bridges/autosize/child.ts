import type { EventsChild } from "../events/child";
import {
  AUTOSIZE_MODE_EVENT,
  AUTOSIZE_SIZE_EVENT,
  autosizesHeight,
  autosizesWidth,
  parseAutosizeMode,
} from "./shared";

export function installAutosizeChild(events: EventsChild) {
  let resizeObserver: ResizeObserver | null = null;
  let rafId: number | null = null;
  let lastWidth = -1;
  let lastHeight = -1;
  let pendingWidthShrink: number | null = null;

  const observeBody = () => {
    // body may appear after the bridge is installed; observe lazily.
    if (!resizeObserver || !document.body) return;
    resizeObserver.observe(document.body);
  };

  const parsePx = (value: string) => {
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
    const marginX = parsePx(style.marginLeft) + parsePx(style.marginRight);
    const marginY = parsePx(style.marginTop) + parsePx(style.marginBottom);
    let width = 0;
    let height = 0;

    if (body.childNodes.length > 0) {
      // Range bounds capture intrinsic content size better than scrollHeight
      // when content is smaller than the viewport.
      const range = document.createRange();
      range.selectNodeContents(body);
      const rangeRect = range.getBoundingClientRect();
      width = Math.max(width, rangeRect.width);
      height = Math.max(height, rangeRect.height);
    }

    for (const child of Array.from(body.children)) {
      if (!(child instanceof HTMLElement)) continue;
      const childStyle = window.getComputedStyle(child);
      if (childStyle.position === "fixed") continue;

      // Keep this loop: without child overflow extents, some pages under-report
      // height by a few pixels and produce nested scrollbars.
      const childWidth = Math.max(
        child.scrollWidth,
        child.offsetWidth,
        child.clientWidth,
      );
      const childHeight = Math.max(
        child.scrollHeight,
        child.offsetHeight,
        child.clientHeight,
      );
      width = Math.max(width, child.offsetLeft + childWidth + parsePx(childStyle.marginRight));
      height = Math.max(height, child.offsetTop + childHeight);
    }

    // A nested element's bottom margin may collapse through its ancestors.
    // It then contributes to document overflow without appearing in their
    // scrollHeight or the range bounds. Measure it in document coordinates so
    // the result can still shrink when the content changes.
    const docTop = doc.getBoundingClientRect().top;
    let documentHeight = height + marginY;
    for (const element of body.querySelectorAll("*")) {
      if (!(element instanceof HTMLElement)) continue;
      const elementStyle = window.getComputedStyle(element);
      const bottomMargin = parsePx(elementStyle.marginBottom);
      if (bottomMargin <= 0 || elementStyle.position === "fixed") continue;
      if (element.getClientRects().length === 0) continue;
      const candidate = element.getBoundingClientRect().bottom - docTop +
        bottomMargin + parsePx(style.marginBottom);
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
      width: Math.max(1, Math.ceil(width + marginX)),
      height: Math.max(1, Math.ceil(documentHeight)),
    };
  };

  const stabilizeWidth = (width: number) => {
    // Keep this guard: without it, autosize="width" can enter a responsive
    // feedback loop and repeatedly shrink toward zero.
    if (lastWidth < 0 || width >= lastWidth) {
      pendingWidthShrink = null;
      return width;
    }

    // A max-content body can become smaller while its iframe keeps the old
    // width. In that case shrinking is independent of the iframe viewport.
    if (document.body &&
      document.body.getBoundingClientRect().width < document.documentElement.clientWidth - 1) {
      pendingWidthShrink = null;
      return width;
    }

    if (pendingWidthShrink !== null && width <= pendingWidthShrink) {
      pendingWidthShrink = null;
      return width;
    }

    pendingWidthShrink = width;
    return lastWidth;
  };

  const emitSize = () => {
    observeBody();
    const measured = measureIntrinsicBodySize();
    const width = stabilizeWidth(measured.width);
    const { height } = measured;

    if (width === lastWidth && height === lastHeight) return;

    lastWidth = width;
    lastHeight = height;
    // Size remains observable so a containing lens can propagate it outward.
    // TODO: A transparent lens which forwards a descendant's size is assumed
    // to add no layout of its own. A future protocol should distinguish direct
    // and forwarded measurements before transparent lenses add surrounding UI
    // or contain multiple independently sized transclusions.
    events.emit(AUTOSIZE_SIZE_EVENT, { width, height });
  };

  const scheduleEmit = () => {
    // Coalesce many observer/resize events into a single measurement per frame.
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      emitSize();
    });
  };

  const rootStyle = document.documentElement.style;
  const originalOverflow = (["x", "y"] as const).map((axis) => {
    const property = `overflow-${axis}`;
    return {
      property,
      value: rootStyle.getPropertyValue(property),
      priority: rootStyle.getPropertyPriority(property),
    };
  });
  events.listen(AUTOSIZE_MODE_EVENT, (event) => {
    const mode = parseAutosizeMode(event.detail);
    for (const { property, value, priority } of originalOverflow) {
      const autosized = property === "overflow-x"
        ? autosizesWidth(mode)
        : autosizesHeight(mode);
      if (autosized) rootStyle.setProperty(property, "hidden", "important");
      else if (value) rootStyle.setProperty(property, value, priority);
      else rootStyle.removeProperty(property);
    }
    // Removing a scrollbar changes the viewport and can change line wrapping.
    scheduleEmit();
  });

  const startAutosize = () => {
    if (!resizeObserver) {
      resizeObserver = new ResizeObserver(() => scheduleEmit());
      resizeObserver.observe(document.documentElement);
      observeBody();
    }

    window.addEventListener("resize", scheduleEmit);
    scheduleEmit();
  };

  startAutosize();

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      // Covers installation before body/layout are fully ready.
      scheduleEmit();
    },
    { once: true },
  );
}

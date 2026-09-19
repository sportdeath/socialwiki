import type { EventsChild } from "../events/child";
import { AUTOSIZE_SIZE_EVENT } from "./shared";

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
      width = Math.max(width, child.offsetLeft + childWidth);
      height = Math.max(height, child.offsetTop + childHeight);
    }

    return {
      width: Math.max(1, Math.ceil(width + marginX)),
      height: Math.max(1, Math.ceil(height + marginY)),
    };
  };

  const stabilizeWidth = (width: number) => {
    // Keep this guard: without it, autosize="width" can enter a responsive
    // feedback loop and repeatedly shrink toward zero.
    if (lastWidth < 0 || width >= lastWidth) {
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

type AutosizeMode = "off" | "height" | "width" | "both";

function parseAutosizeMode(value: unknown): AutosizeMode {
  // Autosize mode arrives over postMessage and may be malformed.
  if (typeof value !== "string") return "off";
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "height" ||
    normalized === "width" ||
    normalized === "both"
  ) {
    return normalized;
  }
  return "off";
}

export function installAutosize() {
  let mode: AutosizeMode = "off";
  let resizeObserver: ResizeObserver | null = null;
  let isBodyObserved = false;
  let rafId: number | null = null;
  let lastWidth = -1;
  let lastHeight = -1;
  let pendingWidthShrink: number | null = null;

  const observeBody = () => {
    // body may appear after the bridge is installed; observe lazily.
    if (!resizeObserver || isBodyObserved || !document.body) return;
    resizeObserver.observe(document.body);
    isBodyObserved = true;
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

    for (const child of Array.from(body.children) as HTMLElement[]) {
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

  const measureSize = () => {
    const doc = document.documentElement;
    const viewportWidth = Math.max(1, window.innerWidth || doc.clientWidth);
    const viewportHeight = Math.max(1, window.innerHeight || doc.clientHeight);
    const content = measureIntrinsicBodySize();

    const width =
      mode === "width" || mode === "both"
        ? content.width
        // For inactive axes, send viewport so payload shape stays stable.
        : viewportWidth;
    const height =
      mode === "height" || mode === "both"
        ? content.height
        : viewportHeight;

    return { width, height };
  };

  const stabilizeWidth = (width: number) => {
    if (mode !== "width" && mode !== "both") {
      pendingWidthShrink = null;
      return width;
    }

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
    if (mode === "off") return;

    observeBody();
    const measured = measureSize();
    const width = stabilizeWidth(measured.width);
    const { height } = measured;

    if (width === lastWidth && height === lastHeight) return;

    lastWidth = width;
    lastHeight = height;
    window.emit("sw-autosize-size", { width, height });
  };

  const scheduleEmit = () => {
    // Coalesce many observer/resize events into a single measurement per frame.
    if (mode === "off" || rafId !== null) return;
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

    // Avoid duplicate listeners when switching between autosize modes.
    window.removeEventListener("resize", scheduleEmit);
    window.addEventListener("resize", scheduleEmit);
    scheduleEmit();
  };

  const stopAutosize = () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }

    window.removeEventListener("resize", scheduleEmit);
    resizeObserver?.disconnect();
    resizeObserver = null;
    isBodyObserved = false;
    lastWidth = -1;
    lastHeight = -1;
    pendingWidthShrink = null;
  };

  const setMode = (nextMode: AutosizeMode) => {
    if (mode === nextMode) {
      // Re-emit in current mode in case DOM changed while mode stayed constant.
      if (mode !== "off") scheduleEmit();
      return;
    }

    mode = nextMode;
    if (mode === "off") {
      stopAutosize();
      return;
    }

    startAutosize();
  };

  window.addEventListener("sw-autosize-mode", (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const payload = event.detail;
    const nextMode =
      typeof payload === "object" && payload !== null
        ? parseAutosizeMode((payload as Record<string, unknown>).mode)
        : "off";
    setMode(nextMode);
  });

  document.addEventListener(
    "DOMContentLoaded",
    () => {
      // Covers cases where mode arrives before body/layout are fully ready.
      if (mode === "off") return;
      scheduleEmit();
    },
    { once: true },
  );
}

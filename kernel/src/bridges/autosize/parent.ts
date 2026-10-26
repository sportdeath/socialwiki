import iframeResize from "@iframe-resizer/parent";
import type { EventsParent } from "../events/parent";
import {
  AUTOSIZE_FALLBACK_EVENT,
  AUTOSIZE_MODE_EVENT,
  type AutosizeContext,
  type AutosizeMode,
  autosizesHeight,
  autosizesWidth,
  parseAutosizeMode,
} from "./shared";

// A page can size itself from its iframe viewport (for example, 100vh plus
// margins). Let the library measure it, but keep the host finite and scrollable.
const MAX_SIZE = 12000;
const REPEATED_GAP = 3;
const PROBE_SIZE = 8;

export function installAutosizeParent(
  element: HTMLElement,
  iframe: HTMLIFrameElement,
  events: EventsParent,
  documentAutosize?: AutosizeContext,
) {
  let mode: AutosizeMode = "off";
  let connected = false;
  let destroyed = false;
  let lastSize: { width: number; height: number } | null = null;
  let fallback = { x: false, y: false };
  const stopped = { x: false, y: false };
  const growth = {
    x: { viewport: -1, delta: 0, count: 0, flips: 0, at: 0, probe: null as number | null, timer: 0 },
    y: { viewport: -1, delta: 0, count: 0, flips: 0, at: 0, probe: null as number | null, timer: 0 },
  };
  const savedStyles = new Map<string, { value: string; priority: string }>();

  const updateFallback = () => {
    const next = {
      x: autosizesWidth(mode) && !!lastSize &&
        Math.floor(lastSize.width) > element.clientWidth,
      y: autosizesHeight(mode) && !!lastSize &&
        Math.floor(lastSize.height) > element.clientHeight,
    };
    // Keep an unmeasured frame scrollable if the library never connects.
    const scrollable = mode === "off" || !lastSize || next.x || next.y;
    iframe.style.overflow = scrollable ? "auto" : "hidden";
    iframe.setAttribute("scrolling", scrollable ? "auto" : "no");
    if (next.x === fallback.x && next.y === fallback.y) return;
    fallback = next;
    events.send(AUTOSIZE_FALLBACK_EVENT, next);
  };

  const fit = (axis: "x" | "y", reported: number) => {
    const enabled = axis === "x" ? autosizesWidth(mode) : autosizesHeight(mode);
    if (!enabled || stopped[axis]) return;

    const viewport = axis === "x" ? element.clientWidth : element.clientHeight;
    const delta = reported - viewport;
    const run = growth[axis];
    const now = performance.now();
    let feedback = false;
    if (run.probe !== null) {
      if (Math.abs(viewport - run.viewport) <= 1) return;
      clearTimeout(run.timer);
      feedback = Math.abs(delta - run.probe) <= 1;
      run.probe = null;
      run.count = 0;
    }
    // The library can report the same layout several times. Count only
    // changes caused by a new iframe viewport.
    if (Math.abs(viewport - run.viewport) > 1) {
      if (delta > 1 && Math.abs(delta - run.delta) <= 1 && now - run.at < 50) run.count++;
      else run.count = delta > 1 ? 1 : 0;
      // A viewport media query can alternate between two sizes indefinitely.
      run.flips = Math.abs(delta) > 1 && Math.abs(delta + run.delta) <= 1 && now - run.at < 30000
        ? run.flips + 1 : 0;
      run.viewport = viewport;
      run.delta = delta;
      run.at = now;
    }
    if (feedback || run.flips >= 2 || reported > MAX_SIZE) stopped[axis] = true;

    // A single large late update is valid. At the cap, native scrolling
    // provides access to content beyond the iframe viewport.
    let size = Math.min(Math.max(reported, stopped[axis] ? viewport : 0), MAX_SIZE);
    if (feedback) size = viewport;
    if (!stopped[axis] && run.count >= REPEATED_GAP) {
      // A small deliberate viewport change distinguishes CSS feedback from
      // unrelated content growing by the same amount at the same rate.
      run.probe = delta;
      size = Math.min(reported + PROBE_SIZE, MAX_SIZE);
      run.timer = window.setTimeout(() => {
        if (run.probe === null || destroyed) return;
        run.probe = null;
        run.count = 0;
        if (lastSize) fit(axis, lastSize[axis === "x" ? "width" : "height"]);
      }, 200);
    }
    const property = axis === "x" ? "width" : "height";
    const style = getComputedStyle(element);
    const start = axis === "x" ? "left" : "top";
    const end = axis === "x" ? "right" : "bottom";
    const px = (name: string) => Number.parseFloat(style.getPropertyValue(name)) || 0;
    const cssSize = style.boxSizing === "border-box"
      ? size + px(`border-${start}-width`) + px(`border-${end}-width`)
      : size - px(`padding-${start}`) - px(`padding-${end}`);
    element.style.setProperty(property, `${Math.max(0, cssSize)}px`);
  };

  const start = () => {
    if (destroyed || connected || mode === "off") return;
    connected = true;
    iframeResize({
      license: "GPLv3",
      direction: "both",
      // Sandboxed documents have opaque origins. With data: frames, the
      // library otherwise mistakes the URL for a postMessage target origin.
      checkOrigin: ["null"],
      scrolling: "auto",
      onReady: () => events.send(AUTOSIZE_MODE_EVENT, mode),
      onResized: ({ width, height }) => {
        if (!Number.isFinite(width) || !Number.isFinite(height) || width < 0 || height < 0) return;
        lastSize = { width, height };
        fit("x", width);
        fit("y", height);
        updateFallback();
      },
    }, iframe);
  };

  const restoreStyle = (property: string) => {
    const saved = savedStyles.get(property);
    if (!saved) return;
    if (saved.value) element.style.setProperty(property, saved.value, saved.priority);
    else element.style.removeProperty(property);
    savedStyles.delete(property);
  };

  const setAutosizeMode = () => {
    const value = element.getAttribute("autosize");
    const next = value === "" ? "both"
      : value?.trim().toLowerCase() === "inherit"
        ? documentAutosize?.mode ?? "off"
        : parseAutosizeMode(value);
    if (next === mode) return;
    mode = next;
    stopped.x = stopped.y = false;
    for (const run of [growth.x, growth.y]) {
      clearTimeout(run.timer);
      run.viewport = -1;
      run.delta = run.count = run.flips = run.at = 0;
      run.probe = null;
    }
    for (const [property, enabled] of [
      ["width", autosizesWidth(mode)],
      ["height", autosizesHeight(mode)],
    ] as const) {
      if (enabled && !savedStyles.has(property)) {
        savedStyles.set(property, {
          value: element.style.getPropertyValue(property),
          priority: element.style.getPropertyPriority(property),
        });
      } else if (!enabled) restoreStyle(property);
    }
    start();
    if (connected) {
      events.send(AUTOSIZE_MODE_EVENT, mode);
      if (lastSize) {
        fit("x", lastSize.width);
        fit("y", lastSize.height);
      }
    }
    updateFallback();
  };

  const resizeObserver = new ResizeObserver(updateFallback);
  resizeObserver.observe(element);
  const observer = new MutationObserver(setAutosizeMode);
  observer.observe(element, { attributes: true, attributeFilter: ["autosize"] });
  const stopInheriting = documentAutosize?.subscribe(() => {
    if (element.getAttribute("autosize")?.trim().toLowerCase() === "inherit") setAutosizeMode();
  });
  setAutosizeMode();

  return {
    destroy() {
      destroyed = true;
      (iframe as HTMLIFrameElement & { iFrameResizer?: { disconnect(): void } })
        .iFrameResizer?.disconnect();
      stopInheriting?.();
      observer.disconnect();
      resizeObserver.disconnect();
      clearTimeout(growth.x.timer);
      clearTimeout(growth.y.timer);
      for (const property of savedStyles.keys()) restoreStyle(property);
    },
  };
}

import type { EventsParent } from "../events/parent";
import {
  AUTOSIZE_MODE_EVENT,
  AUTOSIZE_SIZE_EVENT,
  type AutosizeContext,
  type AutosizeMode,
  autosizesHeight,
  autosizesWidth,
  isAutosizeSize,
  parseAutosizeMode,
} from "./shared";

// A child can change its content in response to its own size indefinitely.
// Bound both the distance and count of host adjustments with one budget.
const AUTOSIZE_BUDGET = 4096;
const MIN_CHANGE_COST = 128;

export function installAutosizeParent(
  element: HTMLElement,
  events: EventsParent,
  documentAutosize?: AutosizeContext,
) {
  let mode: AutosizeMode = "off";
  const savedStyles = new Map<string, { value: string; priority: string }>();
  let lastSize: { width: number; height: number } | null = null;
  let appliedSize: { width: number; height: number } | null = null;
  let firstAppliedSize: { width: number; height: number } | null = null;
  let remainingBudget = AUTOSIZE_BUDGET;
  let stopped = false;

  const applySize = (payload: unknown) => {
    // Size payload comes from an iframe; treat it as untrusted.
    if (!isAutosizeSize(payload)) return;

    const firstSize = lastSize === null;
    lastSize = { width: payload.width, height: payload.height };
    applyLastSize();
    // The first size report confirms the child bridge is ready to receive its
    // mode, including when a cached child script ran before this listener.
    if (firstSize) events.send(AUTOSIZE_MODE_EVENT, mode);
  };

  const applyLastSize = () => {
    if (mode === "off" || !lastSize || stopped) return;
    let size = lastSize;

    // The child reports the space its document needs. The iframe fills the
    // host's padding box, while CSS width/height refer to its content box or
    // border box. Without this conversion, host padding or borders leave the
    // child viewport smaller than reported and can restart a resize loop.
    const style = getComputedStyle(element);
    const px = (value: string) => Number.parseFloat(value) || 0;
    const cssSize = (size: number, start: string, end: string) => {
      const first = px(style.getPropertyValue(`padding-${start}`));
      const last = px(style.getPropertyValue(`padding-${end}`));
      const border = px(style.getPropertyValue(`border-${start}-width`)) +
        px(style.getPropertyValue(`border-${end}-width`));
      // Border-box size = iframe size + borders; content-box size = iframe
      // size - padding. Both give the iframe the requested viewport.
      return Math.max(0, size + (style.boxSizing === "border-box" ? border : -first - last));
    };

    let height = autosizesHeight(mode) ? `${cssSize(size.height, "top", "bottom")}px` : null;
    let width = autosizesWidth(mode) ? `${cssSize(size.width, "left", "right")}px` : null;
    if ((height === null || element.style.height === height) &&
      (width === null || element.style.width === width)) return;

    if (appliedSize) {
      const movement = Math.max(
        MIN_CHANGE_COST,
        height === null ? 0 : Math.abs(size.height - appliedSize.height),
        width === null ? 0 : Math.abs(size.width - appliedSize.width),
      );
      if (movement > remainingBudget) {
        // Finish at a bounded, usable viewport. A 1px skeleton followed by a
        // large page must not leave a 1px frame that is impossible to touch.
        // Holding the larger size also stops two-state media-query loops.
        const first = firstAppliedSize!;
        size = {
          width: Math.max(appliedSize.width, Math.min(size.width, first.width + AUTOSIZE_BUDGET)),
          height: Math.max(appliedSize.height, Math.min(size.height, first.height + AUTOSIZE_BUDGET)),
        };
        height = autosizesHeight(mode) ? `${cssSize(size.height, "top", "bottom")}px` : null;
        width = autosizesWidth(mode) ? `${cssSize(size.width, "left", "right")}px` : null;
        stopped = true;
      } else {
        remainingBudget -= movement;
      }
    }
    if (height !== null) element.style.height = height;
    if (width !== null) element.style.width = width;
    firstAppliedSize ??= size;
    appliedSize = size;
  };

  const stopListening = events.listen((event) => {
    if (event.type !== AUTOSIZE_SIZE_EVENT) return;
    // A size report describes this immediate child, not any containing lens.
    // Do not pass it through as an unhandled event to an outer transclusion.
    event.preventDefault();
    applySize(event.detail);
  });

  const restoreStyle = (axis: string) => {
    const saved = savedStyles.get(axis);
    if (!saved) return;
    if (saved.value) element.style.setProperty(axis, saved.value, saved.priority);
    else element.style.removeProperty(axis);
    savedStyles.delete(axis);
  };

  const saveStyle = (property: string) => {
    if (savedStyles.has(property)) return;
    savedStyles.set(property, {
      value: element.style.getPropertyValue(property),
      priority: element.style.getPropertyPriority(property),
    });
  };

  const setAutosizeMode = () => {
    const value = element.getAttribute("autosize");
    const inherited = value?.trim().toLowerCase() === "inherit";
    const previousMode = mode;
    // A bare `autosize` attribute (`autosize=""`) follows HTML boolean-style
    // usage and enables both axes.
    mode = value === "" ? "both" : inherited
      ? documentAutosize?.mode ?? "off"
      : parseAutosizeMode(value);
    if (mode !== previousMode) {
      // A host-controlled mode change starts a new sizing session.
      appliedSize = firstAppliedSize = null;
      remainingBudget = AUTOSIZE_BUDGET;
      stopped = false;
    }

    // Own only the axes being autosized. Save each inline value and priority
    // before changing it, or switching modes would discard author sizing.
    for (const axis of ["width", "height"] as const) {
      const enabled = axis === "width" ? autosizesWidth(mode) : autosizesHeight(mode);
      if (enabled) saveStyle(axis);
      else restoreStyle(axis);
    }
    applyLastSize();
    if (lastSize) events.send(AUTOSIZE_MODE_EVENT, mode);
  };

  const observer = new MutationObserver(setAutosizeMode);
  observer.observe(element, {
    attributes: true,
    attributeFilter: ["autosize"],
  });
  // The containing bridge may receive its mode after this child is created,
  // and may change it later. Reading only once would leave a nested lens at
  // its initial (usually off) mode.
  const stopInheriting = documentAutosize?.subscribe(() => {
    if (element.getAttribute("autosize")?.trim().toLowerCase() === "inherit") setAutosizeMode();
  });
  setAutosizeMode();

  return {
    destroy() {
      stopListening();
      stopInheriting?.();
      observer.disconnect();
      for (const axis of savedStyles.keys()) restoreStyle(axis);
    },
  };
}

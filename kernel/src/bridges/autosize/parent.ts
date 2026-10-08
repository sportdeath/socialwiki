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

export function installAutosizeParent(
  element: HTMLElement,
  events: EventsParent,
  documentAutosize?: AutosizeContext,
) {
  let mode: AutosizeMode = "off";
  const savedStyles = new Map<string, { value: string; priority: string }>();
  let lastSize: { width: number; height: number } | null = null;

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
    if (mode === "off" || !lastSize) return;

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

    if (autosizesHeight(mode)) {
      element.style.height = `${cssSize(lastSize.height, "top", "bottom")}px`;
    }
    if (autosizesWidth(mode)) {
      element.style.width = `${cssSize(lastSize.width, "left", "right")}px`;
    }
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
    // A bare `autosize` attribute (`autosize=""`) follows HTML boolean-style
    // usage and enables both axes.
    mode = value === "" ? "both" : inherited
      ? documentAutosize?.mode ?? "off"
      : parseAutosizeMode(value);

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

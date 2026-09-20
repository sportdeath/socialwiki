import type { EventsParent } from "../events/parent";
import {
  AUTOSIZE_SIZE_EVENT,
  type AutosizeMode,
  autosizesHeight,
  autosizesWidth,
  parseAutosizeMode,
} from "./shared";

export function installAutosizeParent(
  element: HTMLElement,
  events: EventsParent,
) {
  let mode: AutosizeMode = "off";
  const savedStyles = new Map<string, { value: string; priority: string }>();
  let lastSize: { width: number; height: number } | null = null;

  const applySize = (payload: unknown) => {
    // Size payload comes from an iframe; treat it as untrusted.
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (
      typeof p.width !== "number" ||
      !Number.isFinite(p.width) ||
      p.width < 0 ||
      typeof p.height !== "number" ||
      !Number.isFinite(p.height) ||
      p.height < 0
    ) {
      return;
    }

    lastSize = { width: p.width, height: p.height };
    applyLastSize();
  };

  const applyLastSize = () => {
    if (mode === "off" || !lastSize) return;

    if (autosizesHeight(mode)) {
      element.style.height = `${lastSize.height}px`;
    }
    if (autosizesWidth(mode)) {
      element.style.width = `${lastSize.width}px`;
    }
  };

  const stopListening = events.listen((event) => {
    if (event.type !== AUTOSIZE_SIZE_EVENT) return;
    applySize(event.detail);
  });

  const restoreStyle = (axis: string) => {
    const saved = savedStyles.get(axis);
    if (!saved) return;
    if (saved.value) element.style.setProperty(axis, saved.value, saved.priority);
    else element.style.removeProperty(axis);
    savedStyles.delete(axis);
  };

  const setAutosizeMode = () => {
    const value = element.getAttribute("autosize");
    // A bare `autosize` attribute (`autosize=""`) follows HTML boolean-style
    // usage and enables both axes.
    mode = value === "" ? "both" : parseAutosizeMode(value);

    // Own only the axes being autosized; leave the author's other sizing alone.
    for (const axis of ["width", "height"] as const) {
      const enabled = axis === "width" ? autosizesWidth(mode) : autosizesHeight(mode);
      if (enabled && !savedStyles.has(axis)) {
        savedStyles.set(axis, {
          value: element.style.getPropertyValue(axis),
          priority: element.style.getPropertyPriority(axis),
        });
      } else if (!enabled) {
        restoreStyle(axis);
      }
    }
    applyLastSize();
  };

  const observer = new MutationObserver(setAutosizeMode);
  observer.observe(element, {
    attributes: true,
    attributeFilter: ["autosize"],
  });
  setAutosizeMode();

  return {
    destroy() {
      stopListening();
      observer.disconnect();
      for (const axis of savedStyles.keys()) restoreStyle(axis);
    },
  };
}

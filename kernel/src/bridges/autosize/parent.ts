import type { EventsParent } from "../events/parent";
import {
  AUTOSIZE_MODE_EVENT,
  AUTOSIZE_SIZE_EVENT,
  type AutosizeMode,
  autosizesHeight,
  autosizesWidth,
  parseAutosizeMode,
} from "./shared";

export function installAutosizeParent(
  iframe: HTMLIFrameElement,
  element: HTMLElement,
  events: EventsParent,
) {
  let mode: AutosizeMode = "off";

  const applySize = (payload: unknown) => {
    if (mode === "off") return;

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

    if (autosizesHeight(mode)) {
      element.style.height = `${p.height}px`;
    }
    if (autosizesWidth(mode)) {
      element.style.width = `${p.width}px`;
    }
  };

  const stopListening = events.listen((event) => {
    if (event.type !== AUTOSIZE_SIZE_EVENT) return;
    applySize(event.detail);
  });

  const sendMode = () => {
    // Child can reload/recreate documents; mode must be resent on demand.
    events.send(AUTOSIZE_MODE_EVENT, { mode });
  };

  const setAutosizeMode = () => {
    const value = element.getAttribute("autosize");
    // A bare `autosize` attribute (`autosize=""`) follows HTML boolean-style
    // usage and enables both axes.
    mode = value === "" ? "both" : parseAutosizeMode(value);

    if (!autosizesWidth(mode)) element.style.removeProperty("width");
    if (!autosizesHeight(mode)) element.style.removeProperty("height");

    sendMode();
  };

  const observer = new MutationObserver(setAutosizeMode);
  observer.observe(element, {
    attributes: true,
    attributeFilter: ["autosize"],
  });
  iframe.addEventListener("load", sendMode);
  setAutosizeMode();

  return {
    destroy() {
      stopListening();
      observer.disconnect();
      iframe.removeEventListener("load", sendMode);
    },
  };
}

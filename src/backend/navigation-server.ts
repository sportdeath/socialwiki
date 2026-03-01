function bindNavigateEvent(
  type: string,
  top: boolean,
  onNavigate: (to: string, top?: boolean) => void,
) {
  const handler = (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    if (typeof event.detail !== "string") return;
    onNavigate(event.detail, top);
  };

  window.addEventListener(type, handler as EventListener);
  return () => {
    window.removeEventListener(type, handler as EventListener);
  };
}

export function serveNavigation(
  onNavigate: (to: string, top?: boolean) => void,
  _iframe?: HTMLIFrameElement,
) {
  const disposers = [
    bindNavigateEvent("sw:event:navigate", false, onNavigate),
    bindNavigateEvent("sw:lens-event:navigate", false, onNavigate),
    bindNavigateEvent("sw:event:navigate-top", true, onNavigate),
    bindNavigateEvent("sw:lens-event:navigate-top", true, onNavigate),
  ];

  return {
    destroy: () => {
      for (const dispose of disposers) {
        dispose();
      }
    },
  };
}

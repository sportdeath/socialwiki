declare global {
  interface Window {
    navigate: (to: string) => void;
  }
}

export function installNavigation(origin: string) {
  // Listen from the server for the pages own source
  let fromSrcdoc: string | null = null;
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (d.type !== "transcluded-srcdoc" || typeof d.srcdoc !== "string") return;
    fromSrcdoc = d.srcdoc;
  });

  window.navigate = (to: string) => {
    window.top?.postMessage(
      {
        type: "navigate",
        to,
        fromSrcdoc,
      },
      "*",
    );
  };

  const base = document.createElement("base");
  base.href = origin;
  document.head.append(base);

  document.addEventListener("click", (e: MouseEvent) => {
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    const target = e.target;
    if (!(target instanceof Element)) return;

    const a = target.closest("a[href]");
    if (!(a instanceof HTMLAnchorElement)) return;

    if (a.hasAttribute("download")) return;

    // Only visit links intended for the top
    if (window.parent !== window.top && a.target !== "_top") return;

    e.preventDefault();
    window.navigate(a.href);
  });
}

declare global {
  interface Window {
    navigate: (to: string, top?: boolean) => void;
  }
}

export function installNavigation(origin: string) {
  window.navigate = (to: string, top = false) => {
    window.parent?.postMessage(
      {
        type: "sw-navigate",
        to,
        top,
      },
      "*",
    );
  };

  let currentHash = window.location.hash;
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return;

    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (d.type !== "sw-hash" || typeof d.hash !== "string") return;
    currentHash = d.hash;
    window.location.hash = currentHash;
  });
  window.addEventListener("hashchange", (e) => {
    if (window.location.hash === currentHash) return;
    currentHash = window.location.hash;
    window.navigate(`#${window.location.hash}`);
  });

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

    e.preventDefault();
    window.navigate(a.href, a.target === "_top");
  });
}

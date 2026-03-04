declare global {
  interface Window {
    navigate: (to: string, top?: boolean) => void;
  }
}

export function installNavigation(origin: string) {
  window.navigate = (to: string, top = false) => {
    window.emit("sw-navigate", { to, top });
  };

  let currentHash = window.location.hash;
  window.addEventListener("sw-hash", (event: Event) => {
    if (!(event instanceof CustomEvent)) return;
    const payload = event.detail;
    if (typeof payload !== "object" || payload === null) return;
    const p = payload as Record<string, unknown>;
    if (typeof p.hash !== "string") return;

    currentHash = p.hash;
    if (window.location.hash === currentHash) return;

    const url = new URL(window.location.href);
    url.hash = currentHash;
    // Replace hash without adding iframe history entries.
    window.location.replace(url.toString());
  });
  window.addEventListener("hashchange", () => {
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

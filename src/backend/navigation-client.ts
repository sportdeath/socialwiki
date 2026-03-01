declare global {
  interface Window {
    navigate: (to: string, top?: boolean) => void;
  }
}

export function installNavigation(origin: string) {
  const io = window.socialwiki;

  window.navigate = (to: string, top = false) => {
    io.emit(top ? "navigate-top" : "navigate", to);
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

    e.preventDefault();
    window.navigate(a.href, a.target === "_top");
  });
}

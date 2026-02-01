declare global {
  interface Window {
    navigate: (to: string) => void;
  }
}

export function installNavigation() {
  window.navigate = (to: string) => {
    window.top?.postMessage(
      {
        type: "navigate",
        to,
      },
      "*",
    );
  };

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

export function initLens(
  onLensInput: (pageAddress: string, lensParams: URLSearchParams) => void,
) {
  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (event.source !== window.parent) return;

    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (
      d.type !== "sw-lens-input" ||
      (typeof d.lensParams !== "string" && d.lensParams !== undefined) ||
      typeof d.pageAddress !== "string"
    )
      return;
    onLensInput(d.pageAddress, new URLSearchParams(d.lensParams));
  });
}

export function outputLensStatus(status: string, srcdoc?: string) {
  window.parent.postMessage(
    {
      type: "sw-lens-output",
      status,
      srcdoc,
    },
    "*",
  );
}

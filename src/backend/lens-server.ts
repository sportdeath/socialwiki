export function serveLens(
  iframe: HTMLIFrameElement,
  onLensOutput: (status: string, srcdoc?: string) => void,
) {
  function onMessage(event: MessageEvent<unknown>) {
    // Make sure the message came from the iframe
    if (iframe.contentWindow !== event.source) return;

    const data = event.data;
    if (typeof data !== "object" || data === null) return;
    const d = data as Record<string, unknown>;
    if (
      d.type !== "sw-lens-output" ||
      typeof d.status !== "string" ||
      (typeof d.srcdoc !== "string" && d.srcdoc !== undefined)
    )
      return;

    onLensOutput(d.status, d.srcdoc);
  }

  window.addEventListener("message", onMessage);

  return () => window.removeEventListener("message", onMessage);
}

export function inputLensAddress(
  iframe: HTMLIFrameElement,
  pageAddress: string,
  lensParams: URLSearchParams = new URLSearchParams(),
) {
  const serializedLensParams = lensParams.toString();
  iframe.contentWindow?.postMessage(
    {
      type: "sw-lens-input",
      pageAddress,
      lensParams: serializedLensParams.length ? serializedLensParams : undefined,
    },
    "*",
  );
}

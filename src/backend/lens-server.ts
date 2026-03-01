// Legacy compatibility stubs.
// Lens input/output routing now flows through transclude-io.

export function serveLens(
  _iframe: HTMLIFrameElement,
  _onLensOutput: (status: string, srcdoc?: string) => void,
) {
  return () => {
    // no-op
  };
}

export function inputLensAddress(
  _iframe: HTMLIFrameElement,
  _pageAddress: string,
  _lensParams: URLSearchParams = new URLSearchParams(),
) {
  // no-op
}

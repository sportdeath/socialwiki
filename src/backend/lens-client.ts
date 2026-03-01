function buildLensParams(): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(window.socialwiki.listInputs("lens"))) {
    if (key === "name") continue;
    params.set(key, value);
  }
  return params;
}

function buildPageAddress(): string {
  const pageName = window.socialwiki.getInput("name", "lens") ?? "";
  const pageInputs = window.socialwiki.listInputs("page");

  const query = new URLSearchParams();
  let hash = "";

  for (const [key, value] of Object.entries(pageInputs)) {
    if (key === "hash") {
      hash = value;
      continue;
    }
    query.set(key, value);
  }

  const queryString = query.toString();
  return `${pageName}${queryString.length ? `?${queryString}` : ""}${hash}`;
}

export function initLens(
  onLensInput: (pageAddress: string, lensParams: URLSearchParams) => void,
) {
  const onUpdate = () => {
    onLensInput(buildPageAddress(), buildLensParams());
  };

  window.socialwiki.onInputsChange(onUpdate);
}

export function outputLensStatus(status: string, srcdoc?: string) {
  window.socialwiki.setOutput("status", status, "lens");
  window.socialwiki.setOutput("srcdoc", srcdoc, "lens");
}

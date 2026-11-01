const prefix = "socialwiki-bootstrap:";

function read(name: string): Record<string, unknown> {
  if (!name.startsWith(prefix)) return {};
  try {
    const value = JSON.parse(name.slice(prefix.length));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

// A browsing-context name is available synchronously, even in an opaque frame.
// Each bridge sets its metadata before navigation and consumes only its own key
// in init.js. This is descriptive data; parent bridges still enforce authority.
export function prepareFrameData(iframe: HTMLIFrameElement, key: string, value: unknown) {
  iframe.name = prefix + JSON.stringify({ ...read(iframe.name), [key]: value });
}

export function consumeFrameData(key: string): unknown {
  if (!window.name.startsWith(prefix)) return undefined;
  const data = read(window.name);
  const value = data[key];
  delete data[key];
  window.name = Object.keys(data).length ? prefix + JSON.stringify(data) : "";
  return value;
}

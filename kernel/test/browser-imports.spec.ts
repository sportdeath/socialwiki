import { afterEach, expect, it, vi } from "vitest";
import { installBrowserImports } from "../src/browser-imports";

afterEach(() => {
  document.head.replaceChildren();
  vi.unstubAllGlobals();
});

it("maps bare imports to one document-local module", () => {
  const createObjectURL = vi.fn((_blob: Blob) => "blob:https://example.test/libraries");
  vi.stubGlobal("URL", { createObjectURL });
  vi.stubGlobal("BROWSER_MODULES_SOURCE", "export const marker = true;");
  const imports = ["vue", "@graffiti-garden/wrapper-vue", "@graffiti-garden/api"];
  vi.stubGlobal("BROWSER_IMPORTS", imports);

  const script = installBrowserImports();
  expect(script.type).toBe("importmap");
  expect(document.head.querySelectorAll('script[type="importmap"]')).toHaveLength(1);
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  const blob = createObjectURL.mock.calls[0][0] as Blob;
  expect(blob.type).toBe("text/javascript");
  expect(blob.size).toBe("export const marker = true;".length);
  expect(JSON.parse(script.textContent!).imports).toEqual(
    Object.fromEntries(imports.map(name => [name, "blob:https://example.test/libraries"])),
  );

  // The root drops this element before serializing; a child gets its own URL.
  script.remove();
  createObjectURL.mockReturnValueOnce("blob:null/child-libraries");
  const childMap = installBrowserImports();
  expect(new Set(Object.values(JSON.parse(childMap.textContent!).imports)))
    .toEqual(new Set(["blob:null/child-libraries"]));
});

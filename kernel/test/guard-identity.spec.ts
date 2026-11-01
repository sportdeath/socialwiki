import type { Graffiti } from "@graffiti-garden/api";
import { expect, it, vi } from "vitest";
import { consumeFrameData } from "../src/bridges/bootstrap";
import { installGuardIdentity, prepareGuardFrame } from "../src/bridges/graffiti/identity";
import { withTranscludeSource } from "../src/bridges/graffiti/parent";
import { preparePeripheralsFrame, readPeripheralFeatures } from "../src/bridges/peripherals/features";
import { createPeripheralsHost } from "../src/bridges/peripherals/host";
import { createPeripheralPermissions } from "../src/bridges/peripherals/permissions";

function childPath(host: HTMLElement, parentPath: readonly string[]) {
  const iframe = document.createElement("iframe");
  prepareGuardFrame(iframe, host, parentPath);
  window.name = iframe.name;
  return consumeFrameData("guardPath") as string[];
}

it("uses the same nested scope as posts, including inherited scopes and fallback IDs", async () => {
  const root = { sessionEvents: new EventTarget(), post: vi.fn() } as unknown as Graffiti;
  let graffiti = root;
  const origin = "https://social.wiki";
  let path = [origin];
  const scopes = [];
  for (const [id, inherit] of [["ourchats", false], ["view", true], ["", false]] as const) {
    const host = document.createElement("sw-transclude");
    host.id = id;
    if (inherit) host.setAttribute("permission-scope", "inherit");
    path = childPath(host, path);
    const scope = withTranscludeSource(graffiti, host);
    scopes.push(scope);
    graffiti = scope.graffiti;
  }
  await graffiti.post({ value: {}, channels: [] }, { actor: "alice" });
  const session = vi.mocked(root.post).mock.calls[0][1] as { source: { id: string }[] };
  expect(path).toEqual([origin, ...session.source.map(({ id }) => id)]);
  expect(path).toHaveLength(3);
  scopes.forEach(scope => scope.destroy());
});

it("changes with scope IDs and origins, but not labels or routes", () => {
  const host = document.createElement("sw-transclude");
  host.id = "version-1";
  const first = childPath(host, ["https://social.wiki"]);
  host.setAttribute("name", "New name");
  host.setAttribute("route", "new-route");
  expect(childPath(host, ["https://social.wiki"])).toEqual(first);
  expect(childPath(host, ["https://another.example"])).not.toEqual(first);
  host.id = "version-2";
  expect(childPath(host, ["https://social.wiki"])).not.toEqual(first);
  host.setAttribute("permission-scope", "inherit");
  expect(childPath(host, ["https://social.wiki"])).toEqual(["https://social.wiki"]);
});

it("exposes a synchronous read-only ID while preserving peripheral bootstrap data", () => {
  const iframe = document.createElement("iframe");
  const host = document.createElement("sw-transclude");
  host.id = "chat";
  const peripherals = createPeripheralsHost(new Map(), createPeripheralPermissions({ storage: null }));
  peripherals.features = { filePickers: ["showOpenFilePicker"] };
  prepareGuardFrame(iframe, host, ["https://social.wiki"]);
  expect(preparePeripheralsFrame(iframe, host, peripherals)).toBeUndefined();
  window.name = iframe.name;
  installGuardIdentity(consumeFrameData("guardPath"));
  expect(window.guard.id).toBe(JSON.stringify(["https://social.wiki", "chat"]));
  expect(Object.keys(window.guard)).toEqual(["id"]);
  expect(Reflect.set(window.guard, "id", "another site")).toBe(false);
  expect(Reflect.set(window, "guard", {})).toBe(false);
  expect(readPeripheralFeatures()).toEqual(peripherals.features);
  expect(window.name).toBe("");
});

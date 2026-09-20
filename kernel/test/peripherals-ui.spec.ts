import { afterEach, describe, expect, it, vi } from "vitest";
import { createPermissionUI } from "../src/bridges/peripherals/ui";
import { createPeripheralPermissions, PERMISSION_STORAGE_KEY } from "../src/bridges/peripherals/permissions";
import { Storage as DOMStorage } from "happy-dom";

const scope = { capability: "geolocation", source: [{ id: "page", name: "Map" }] };
function prompt() {
  const ui = createPermissionUI(() => [], () => {});
  const controller = new AbortController();
  const answer = ui.ask(scope, { label: "location" }, controller.signal);
  const shadow = document.body.lastElementChild!.shadowRoot!;
  const panel = shadow.querySelector("dialog")!;
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ left: 100, right: 300, top: 100, bottom: 300 } as DOMRect);
  const button = (text: string) => [...panel.querySelectorAll("button")].find((b) => b.textContent === text)!;
  return { ui, controller, answer, panel, button };
}
afterEach(() => document.body.replaceChildren());

describe("peripheral permission dismissal", () => {
  it("only offers management for the requesting document's subtree", () => {
    const storage = new DOMStorage();
    storage.setItem(PERMISSION_STORAGE_KEY, JSON.stringify([
      { ...scope, label: "location", allow: true },
      { ...scope, source: [...scope.source, { id: "child", name: "Child" }], label: "location", allow: true },
      { ...scope, source: [{ id: "sibling", name: "Sibling" }], label: "location", allow: true },
      { ...scope, source: [...scope.source, { id: "closed", name: "Closed page" }], label: "location", allow: true },
    ]));
    const permissions = createPeripheralPermissions({ storage });
    permissions.registerDocument(scope.source);
    permissions.registerDocument([...scope.source, { id: "child", name: "Child" }]);
    permissions.registerDocument([{ id: "sibling", name: "Sibling" }]);
    permissions.show(scope.source);
    const panel = document.body.lastElementChild!.shadowRoot!.querySelector("dialog")!;
    expect(panel.textContent).toContain("Child");
    expect(panel.textContent).not.toContain("Sibling");
    expect(panel.textContent).not.toContain("Closed page");
    expect(panel.querySelector("h2")!.textContent).toBe("Permissions");
    expect([...panel.querySelectorAll("th")].map((th) => th.textContent)).toEqual(["Site", "Permission", "Action"]);
    expect(panel.querySelectorAll("tbody tr")).toHaveLength(2);
    panel.querySelector("tbody button")!.dispatchEvent(new MouseEvent("click"));
    expect(JSON.parse(storage.getItem(PERMISSION_STORAGE_KEY)!).map((s: { source: { id: string }[] }) => s.source.at(-1)!.id))
      .toEqual(["child", "sibling", "closed"]);
  });
  it("retains saved decisions while hiding pages after their last instance closes", () => {
    const storage = new DOMStorage();
    const saved = JSON.stringify([{ ...scope, label: "location", allow: false }]);
    storage.setItem(PERMISSION_STORAGE_KEY, saved);
    const permissions = createPeripheralPermissions({ storage });
    // An open ancestor must not make every historically visited descendant visible.
    permissions.registerDocument([]);
    permissions.show([]);
    const panel = document.body.lastElementChild!.shadowRoot!.querySelector("dialog")!;
    expect(panel.querySelectorAll("tbody tr")).toHaveLength(0);
    const closeFirst = permissions.registerDocument(scope.source);
    const closeSecond = permissions.registerDocument(scope.source);
    expect(panel.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(panel.textContent).toContain("Blocked");
    closeFirst();
    expect(panel.querySelectorAll("tbody tr")).toHaveLength(1);
    closeSecond();
    expect(panel.querySelectorAll("tbody tr")).toHaveLength(0);
    expect(storage.getItem(PERMISSION_STORAGE_KEY)).toBe(saved);
    permissions.registerDocument([{ id: "page", name: "Renamed page" }]);
    expect(panel.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(panel.textContent).toContain("Renamed page");
  });
  it("blocks a backdrop click without saving a remembered denial", async () => {
    const p = prompt();
    p.panel.querySelector("input")!.checked = true;
    p.panel.dispatchEvent(new MouseEvent("pointerdown", { clientX: 10, clientY: 10 }));
    p.panel.dispatchEvent(new MouseEvent("click", { clientX: 10, clientY: 10 }));
    expect(await p.answer).toEqual({ allow: false, remember: false });
    expect(p.panel.open).toBe(false);
  });
  it("does not dismiss for clicks inside or a drag starting inside", async () => {
    const p = prompt();
    p.panel.dispatchEvent(new MouseEvent("pointerdown", { clientX: 150, clientY: 150 }));
    p.panel.dispatchEvent(new MouseEvent("click", { clientX: 10, clientY: 10 }));
    expect(p.panel.open).toBe(true);
    p.button("Allow").click();
    expect(await p.answer).toEqual({ allow: true, remember: false });
  });
  it("records an explicit remembered denial and treats Escape as a temporary block", async () => {
    const p = prompt();
    p.panel.querySelector("input")!.checked = true;
    p.button("Deny").click();
    expect(await p.answer).toEqual({ allow: false, remember: true });
    const next = prompt();
    next.panel.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(await next.answer).toEqual({ allow: false, remember: false });
  });
});

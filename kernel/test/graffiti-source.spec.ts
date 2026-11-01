import type { Graffiti } from "@graffiti-garden/api";
import { describe, expect, it, vi } from "vitest";
import { withTranscludeSource } from "../src/bridges/graffiti/parent";

function host(id: string, name = id) {
  const element = document.createElement("sw-transclude");
  element.id = id;
  element.setAttribute("name", name);
  return element;
}

function implementation() {
  return { sessionEvents: new EventTarget(), login: vi.fn(), post: vi.fn() } as unknown as Graffiti;
}

describe("Graffiti transclude sources", () => {
  it("binds login and posts to the actual immediate frame", async () => {
    const parent = implementation();
    const child = withTranscludeSource(parent, host("chat", "Chat"));
    const session = { actor: "alice" };
    const object = { value: {}, channels: [] };
    await child.graffiti.login();
    await child.graffiti.post(object, session);
    const source = [{ id: "chat", name: "Chat" }];
    expect(parent.login).toHaveBeenCalledWith({ source });
    expect(parent.post).toHaveBeenCalledWith(object, { ...session, source });
    expect(session).toEqual({ actor: "alice" });
    child.destroy();
  });

  it("adds nested frames in ancestor-to-child order", async () => {
    const root = implementation();
    const outer = withTranscludeSource(root, host("chats", "Chats"));
    const inner = withTranscludeSource(outer.graffiti, host("room", "Room"));
    await inner.graffiti.login({ state: "caller-state" });
    expect(root.login).toHaveBeenCalledWith({ state: "caller-state", source: [
      { id: "chats", name: "Chats" }, { id: "room", name: "Room" },
    ] });
    inner.destroy(); outer.destroy();
  });

  it("lets a child login reach ancestors without exposing it to siblings", () => {
    const root = implementation();
    const outer = withTranscludeSource(root, host("chats", "Chats"));
    const inner = withTranscludeSource(outer.graffiti, host("room", "Room"));
    const sibling = withTranscludeSource(outer.graffiti, host("game", "Game"));
    const listeners = [outer, inner, sibling].map(view => {
      const listener = vi.fn();
      view.graffiti.sessionEvents.addEventListener("login", listener);
      return listener;
    });
    root.sessionEvents.dispatchEvent(new CustomEvent("login", {
      detail: { session: { actor: "alice", guardSites: [["chats", "room"]] } },
    }));
    expect(listeners.map(listener => listener.mock.calls.length)).toEqual([1, 1, 0]);
    for (const view of [inner, sibling, outer]) view.destroy();
  });

  it("shares scope only when the containing page asks to inherit", async () => {
    const parent = implementation();
    const element = host("view", "View");
    element.setAttribute("permission-scope", "inherit");
    const child = withTranscludeSource(parent, element);
    await child.graffiti.login();
    expect(parent.login).toHaveBeenCalledWith({ source: [] });
    child.destroy();
  });

  it("reads changed labels and IDs when making the next request", async () => {
    const parent = implementation();
    const element = host("old", "Old");
    const child = withTranscludeSource(parent, element);
    await child.graffiti.login();
    expect(parent.login).toHaveBeenLastCalledWith({ source: [{ id: "old", name: "Old" }] });
    element.id = "new";
    element.setAttribute("name", "New");
    await child.graffiti.login();
    expect(parent.login).toHaveBeenLastCalledWith({ source: [{ id: "new", name: "New" }] });
    child.destroy();
  });
});

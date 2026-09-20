import type { Graffiti, GraffitiSession } from "@graffiti-garden/api";
import { describe, expect, it, vi } from "vitest";
import { withTranscludeSource } from "../src/bridges/graffiti/parent";

type SourceSession = GraffitiSession & {
  source?: { id: string; name: string }[];
};

function captureSession(host: HTMLElement, session: SourceSession) {
  const post = vi.fn((_object: unknown, forwardedSession: SourceSession) =>
    Promise.resolve(forwardedSession),
  );
  const graffiti = withTranscludeSource(
    { post } as unknown as Graffiti,
    host,
  );
  void graffiti.post({ value: {}, channels: [] }, session);
  return post.mock.calls[0][1];
}

describe("Graffiti transclude sources", () => {
  it("prepends an ordinary transclude's identity", () => {
    const host = document.createElement("sw-transclude");
    host.id = "view";
    host.setAttribute("name", "View");
    const page = { id: "page", name: "mypage" };

    expect(captureSession(host, { actor: "alice", source: [page] }).source)
      .toEqual([{ id: "view", name: "View" }, page]);
  });

  it("preserves the child's source when permission scope is inherited", () => {
    const host = document.createElement("sw-transclude");
    host.id = "view";
    host.setAttribute("name", "View");
    host.setAttribute("permission-scope", "inherit");
    const page = { id: "page", name: "mypage" };

    expect(captureSession(host, { actor: "alice", source: [page] }).source)
      .toEqual([page]);
  });

  it("keeps fallback identity stable while reading changed labels per request", () => {
    const host = document.createElement("sw-transclude");
    const first = captureSession(host, { actor: "alice" }).source!;
    host.setAttribute("name", "Renamed");
    expect(captureSession(host, { actor: "alice" }).source)
      .toEqual([{ id: first[0].id, name: "Renamed" }]);
    host.id = "new-document";
    expect(captureSession(host, { actor: "alice" }).source)
      .toEqual([{ id: "new-document", name: "Renamed" }]);
  });

  it("keeps unknown inheritance values isolated and preserves ancestor order", () => {
    const host = document.createElement("sw-transclude");
    host.id = "parent";
    host.setAttribute("permission-scope", "unknown");
    const child = { id: "child", name: "Child" };
    expect(captureSession(host, { actor: "alice", source: [child] }).source)
      .toEqual([{ id: "parent", name: "Unnamed" }, child]);
  });
});

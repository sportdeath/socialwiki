import { afterEach, describe, expect, it, vi } from "vitest";
import { installPeripheralsParent } from "../src/bridges/peripherals/parent";
import type { ParentMethods, PeripheralsService, PeripheralRequest, PeripheralSink, Subscription } from "../src/bridges/peripherals/shared";

const connections = vi.hoisted(() => [] as { methods: ParentMethods; update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[]);
vi.mock("penpal", () => ({
  WindowMessenger: class {}, CallOptions: class {},
  connect: ({ methods }: { methods: ParentMethods }) => {
    const update = vi.fn(async () => {}); const destroy = vi.fn();
    connections.push({ methods, update, destroy });
    return { promise: Promise.resolve({ update }), destroy };
  },
}));

const request: PeripheralRequest = { source: [{ id: "leaf", name: "Leaf" }],
  capability: "geolocation", method: "watchPosition", args: [{}] };
function endpoint(id: string, service: Pick<PeripheralsService, "start"> & Partial<PeripheralsService>, inherit = false) {
  const host = document.createElement("div"); host.id = id; host.setAttribute("name", id);
  if (inherit) host.setAttribute("permission-scope", "inherit");
  const iframe = document.createElement("iframe"); document.body.append(iframe);
  return { bridge: installPeripheralsParent(iframe, host, {
    showPermissions() {}, registerDocument: () => () => {}, ...service,
  }), host, iframe, rpc: connections.at(-1)! };
}
afterEach(() => { document.body.replaceChildren(); connections.length = 0; });

describe("peripherals iframe ownership", () => {
  it("tracks idle documents and descendants through rename, replacement, and teardown", async () => {
    const registerDocument = vi.fn(() => vi.fn());
    const a = endpoint("a", { start: () => ({ stop() {} }), registerDocument });
    expect(registerDocument).toHaveBeenLastCalledWith([{ id: "a", name: "a" }]);
    a.rpc.methods.open(1, { kind: "document", source: request.source });
    expect(registerDocument).toHaveBeenLastCalledWith([{ id: "a", name: "a" }, ...request.source]);
    expect(() => a.rpc.methods.open(0, { kind: "document", source: [] })).toThrow();
    expect(() => a.rpc.methods.open(1, { kind: "document", source: [] })).toThrow();
    a.rpc.methods.close(0);
    expect(registerDocument.mock.results[0].value).not.toHaveBeenCalled();
    a.host.id = "replacement";
    a.host.setAttribute("name", "New name");
    await vi.waitFor(() => expect(registerDocument).toHaveBeenCalledTimes(4));
    expect(registerDocument.mock.results[0].value).toHaveBeenCalledTimes(1);
    expect(registerDocument.mock.results[1].value).toHaveBeenCalledTimes(1);
    expect(registerDocument).toHaveBeenLastCalledWith([{ id: "replacement", name: "New name" }, ...request.source]);
    a.rpc.methods.close(1);
    expect(registerDocument.mock.results[3].value).toHaveBeenCalledTimes(1);
    a.bridge.destroy();
    expect(registerDocument.mock.results[2].value).toHaveBeenCalledTimes(1);
    expect(registerDocument.mock.results[3].value).toHaveBeenCalledTimes(1);
  });
  it("registers inherited scopes without adding a document segment", () => {
    const registerDocument = vi.fn(() => vi.fn());
    const a = endpoint("container", { start: () => ({ stop() {} }), registerDocument }, true);
    expect(registerDocument).toHaveBeenLastCalledWith([]);
    a.rpc.methods.open(1, { kind: "document", source: request.source });
    expect(registerDocument).toHaveBeenLastCalledWith(request.source);
    a.bridge.destroy();
  });
  it("scopes permission management to the caller's subtree", () => {
    const showPermissions = vi.fn();
    const a = endpoint("a", { start: () => ({ stop() {} }), showPermissions });
    a.rpc.methods.showPermissions(request.source);
    expect(showPermissions).toHaveBeenCalledWith([{ id: "a", name: "a" }, ...request.source]);
    expect(() => a.rpc.methods.showPermissions(null as unknown as [])).toThrow();
    a.bridge.destroy();
  });
  it("uses shared ancestor scope rules and isolates equal IDs in sibling frames", () => {
    const stops: ReturnType<typeof vi.fn>[] = [];
    const start = vi.fn<PeripheralsService["start"]>(() => { const stop = vi.fn(); stops.push(stop); return { stop }; });
    const a = endpoint("a", { start }); const b = endpoint("b", { start });
    a.rpc.methods.open(1, { ...request, kind: "request" }); b.rpc.methods.open(1, { ...request, kind: "request" });
    expect(start.mock.calls.map(([r]) => r.source)).toEqual([
      [{ id: "a", name: "a" }, ...request.source], [{ id: "b", name: "b" }, ...request.source],
    ]);
    a.rpc.methods.close(1);
    expect(stops[0]).toHaveBeenCalledTimes(1); expect(stops[1]).not.toHaveBeenCalled();
    a.bridge.destroy(); b.bridge.destroy();
    expect(stops[1]).toHaveBeenCalledTimes(1);
  });
  it("routes controls only to a live request owned by this iframe", async () => {
    const sends: ReturnType<typeof vi.fn>[] = [];
    const start: PeripheralsService["start"] = () => {
      const send = vi.fn(async (message) => message); sends.push(send);
      return { stop() {}, send };
    };
    const a = endpoint("a", { start }); const b = endpoint("b", { start });
    a.rpc.methods.open(1, { ...request, kind: "request" });
    b.rpc.methods.open(1, { ...request, kind: "request" });
    const message = { type: "candidate", candidate: null };
    await a.rpc.methods.send(1, message);
    expect(sends[0]).toHaveBeenCalledExactlyOnceWith(message);
    expect(sends[1]).not.toHaveBeenCalled();
    await expect(a.rpc.methods.send(0, message)).rejects.toThrow("unavailable");
    a.rpc.methods.close(1);
    await expect(a.rpc.methods.send(1, message)).rejects.toThrow("unavailable");
    await b.rpc.methods.send(1, message);
    expect(sends[1]).toHaveBeenCalledExactlyOnceWith(message);
    a.bridge.destroy(); b.bridge.destroy();
  });
  it("honors inheritance chosen by the containing document", () => {
    const start = vi.fn<PeripheralsService["start"]>(() => ({ stop() {} }));
    const a = endpoint("container", { start }, true);
    a.rpc.methods.open(1, { ...request, kind: "request" });
    expect(start.mock.calls[0][0].source).toEqual(request.source);
    a.bridge.destroy();
  });
  it("rejects malformed requests and duplicate IDs before touching a service", () => {
    const start = vi.fn<PeripheralsService["start"]>(() => ({ stop() {} }));
    const a = endpoint("a", { start });
    expect(() => a.rpc.methods.open(1, { ...request, kind: "request", source: null } as unknown as Subscription)).toThrow();
    expect(() => a.rpc.methods.open(-1, { ...request, kind: "request" })).toThrow();
    expect(start).not.toHaveBeenCalled();
    a.rpc.methods.open(1, { ...request, kind: "request" });
    expect(() => a.rpc.methods.open(1, { ...request, kind: "request" })).toThrow();
    expect(start).toHaveBeenCalledTimes(1);
    a.bridge.destroy();
  });
  it("ignores late updates and tears down requests on document self-navigation", async () => {
    let emit!: PeripheralSink; const stop = vi.fn();
    const a = endpoint("a", { start: (_request, sink) => { emit = sink; return { stop }; } });
    a.iframe.dispatchEvent(new Event("load"));
    a.rpc.methods.open(1, { ...request, kind: "request" });
    a.iframe.dispatchEvent(new Event("load"));
    emit({ type: "data", value: "too late" });
    await Promise.resolve();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(a.rpc.update).not.toHaveBeenCalled();
    expect(a.rpc.destroy).toHaveBeenCalledTimes(1);
    expect(() => a.rpc.methods.open(2, { ...request, kind: "request" })).toThrow();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { installPeripheralsChild } from "../src/bridges/peripherals/child";
import type { ChildMethods, ParentMethods, PeripheralRequest } from "../src/bridges/peripherals/shared";

const rpc = vi.hoisted(() => ({
  methods: {} as ChildMethods,
  resolve: (_remote: ParentMethods) => {},
}));
vi.mock("penpal", () => ({
  WindowMessenger: class {},
  connect: ({ methods }: { methods: ChildMethods }) => {
    rpc.methods = methods;
    return { promise: new Promise<ParentMethods>((resolve) => { rpc.resolve = resolve; }) };
  },
}));
vi.mock("../src/bridges/peripherals/adapters", () => ({ installPeripheralAdapters: vi.fn() }));
const request: PeripheralRequest = { source: [], capability: "geolocation", method: "watchPosition", args: [{}] };
const flush = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); };
const remote = () => ({ open: vi.fn(), close: vi.fn(), showPermissions: vi.fn() });
afterEach(() => window.dispatchEvent(new Event("pagehide")));

describe("peripherals child subscriptions", () => {
  it("cancels documents and requests before the connection is ready", async () => {
    const service = installPeripheralsChild();
    const stop = service.start(request, vi.fn());
    const unregister = service.registerDocument([]);
    stop(); stop(); unregister(); unregister();
    const host = remote(); rpc.resolve(host); await flush();
    expect(host.open).not.toHaveBeenCalled();
    // Closing an unopened ID is harmless; the parent already treats it as a no-op.
    expect(host.close).toHaveBeenCalledTimes(2);
  });
  it("keeps document presence separate from terminal request results and pagehide", async () => {
    const service = installPeripheralsChild();
    const host = remote(); rpc.resolve(host);
    const update = vi.fn();
    const stop = service.start(request, update);
    const unregister = service.registerDocument([]);
    await flush();
    const requestId = host.open.mock.calls.find(([, value]) => value.kind === "request")![0];
    const documentId = host.open.mock.calls.find(([, value]) => value.kind === "document")![0];
    rpc.methods.update(requestId, { type: "data", value: "position" });
    rpc.methods.update(requestId, { type: "end" });
    rpc.methods.update(requestId, { type: "data", value: "late" });
    stop();
    expect(update).toHaveBeenCalledTimes(2);
    service.start(request, vi.fn()); await flush();
    window.dispatchEvent(new Event("pagehide")); await flush();
    expect(host.close).not.toHaveBeenCalledWith(documentId);
    unregister(); await flush();
    expect(host.close).toHaveBeenCalledWith(documentId);
  });
  it("reports an RPC failure and ignores late updates after cancellation", async () => {
    const service = installPeripheralsChild();
    const host = remote(); host.open.mockRejectedValue(new Error("Connection lost"));
    rpc.resolve(host);
    const update = vi.fn(); service.start(request, update); await flush();
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ type: "error", name: "NotReadableError" }));
    rpc.methods.update(host.open.mock.calls[0][0], { type: "data", value: "late" });
    expect(update).toHaveBeenCalledTimes(1);
  });
});

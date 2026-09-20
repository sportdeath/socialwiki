import { afterEach, describe, expect, it, vi } from "vitest";
import { createFileSystemAdapter } from "../src/bridges/peripherals/adapters/filesystem/host";
import { createFileSystemClient } from "../src/bridges/peripherals/adapters/filesystem/child";
import { createPeripheralsHost } from "../src/bridges/peripherals/host";
import { createPeripheralPermissions, type AskPermission } from "../src/bridges/peripherals/permissions";

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function fileHandle() {
  let content = "initial";
  const writers: { write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; abort: ReturnType<typeof vi.fn> }[] = [];
  const handle = { kind: "file", name: "test.html", getFile: vi.fn(async () => new File([content], "test.html")),
    createWritable: vi.fn(async (options?: FileSystemCreateWritableOptions) => {
      let pending = options?.keepExistingData ? content : ""; let aborted = false;
      const writer = { write: vi.fn(async (text) => { pending += text; }),
        close: vi.fn(async () => { if (!aborted) content = pending; }),
        abort: vi.fn(async () => { aborted = true; }) };
      writers.push(writer); return writer;
    }) };
  return { handle: handle as unknown as FileSystemFileHandle, native: handle, writers,
    contents: () => content, externalSave: (text: string) => { content = text; } };
}
function setup(ask: AskPermission = async () => ({ allow: true, remember: false })) {
  const file = fileHandle();
  const save = vi.fn(async () => file.handle);
  const permissions = createPeripheralPermissions({ storage: null, ask });
  const service = createPeripheralsHost(new Map([["file-system", createFileSystemAdapter({ showSaveFilePicker: save })]]), permissions);
  return { ...file, save, permissions, service, client: createFileSystemClient(service) };
}
afterEach(() => window.dispatchEvent(new Event("pagehide")));

describe("file-system adapter", () => {
  it("uses the shared guard before the native picker", async () => {
    const s = setup(async () => ({ allow: false, remember: false }));
    await expect(s.client.showSaveFilePicker()).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(s.save).not.toHaveBeenCalled();
  });
  it("returns File snapshots and observes subsequent external saves", async () => {
    const s = setup(); const handle = await s.client.showSaveFilePicker();
    const first = await handle.getFile();
    expect(first).toBeInstanceOf(File);
    expect(await first.text()).toBe("initial");
    s.externalSave("saved in VS Code");
    expect(await (await handle.getFile()).text()).toBe("saved in VS Code");
    expect(await first.text()).toBe("initial");
    expect(handle).not.toBe(s.handle);
  });
  it("commits only on close, and abort preserves the file", async () => {
    const s = setup(); const handle = await s.client.showSaveFilePicker();
    const writer = await handle.createWritable(); await writer.write("changed");
    expect(s.contents()).toBe("initial");
    await writer.close(); expect(s.contents()).toBe("changed");
    const next = await handle.createWritable(); await next.write("discarded"); await next.abort();
    expect(s.contents()).toBe("changed");
  });
  it("revocation aborts an open writer and rejects future reads/writes", async () => {
    const s = setup(); const handle = await s.client.showSaveFilePicker();
    const writer = await handle.createWritable(); await writer.write("discarded");
    s.permissions.revoke({ source: [], capability: "file-system" });
    expect(s.writers[0].abort).toHaveBeenCalledTimes(1);
    await expect(handle.getFile()).rejects.toMatchObject({ name: "NotAllowedError" });
    await expect(writer.close()).rejects.toThrow();
    expect(s.contents()).toBe("initial");
  });
  it("disconnect rejects a pending picker and discards its late result", async () => {
    const s = setup(); let resolve!: (handle: FileSystemFileHandle) => void;
    s.save.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const pending = s.client.showSaveFilePicker();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await flush(); s.client.disconnect(); await rejected;
    resolve(s.handle); await flush();
    expect(s.native.getFile).not.toHaveBeenCalled();
    expect(s.native.createWritable).not.toHaveBeenCalled();
  });
  it("aborts a writer that finishes opening after disconnect", async () => {
    const s = setup(); const handle = await s.client.showSaveFilePicker();
    let resolve!: (writer: never) => void;
    s.native.createWritable.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
    const pending = handle.createWritable();
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await flush(); s.client.disconnect();
    const writer = { abort: vi.fn(async () => {}) };
    resolve(writer as never); await rejected; await flush();
    expect(writer.abort).toHaveBeenCalledTimes(1);
  });
  it("keeps file handles scoped to their own requests", async () => {
    const s = setup(); const other = fileHandle(); s.save.mockResolvedValueOnce(s.handle).mockResolvedValueOnce(other.handle);
    const first = await s.client.showSaveFilePicker(); const second = await s.client.showSaveFilePicker();
    const writer = await first.createWritable(); await writer.write("only first"); await writer.close();
    expect(await (await second.getFile()).text()).toBe("initial");
  });
  it("reports unsupported native pickers without prompting for a useless grant", async () => {
    const ask = vi.fn<AskPermission>(async () => ({ allow: true, remember: false }));
    const service = createPeripheralsHost(new Map([["file-system", createFileSystemAdapter({})]]),
      createPeripheralPermissions({ storage: null, ask }));
    await expect(createFileSystemClient(service).showSaveFilePicker()).rejects.toMatchObject({ name: "NotSupportedError" });
    expect(ask).not.toHaveBeenCalled();
  });
});

it("supports multiple selection and forwards picker and writer options", async () => {
  const files = [fileHandle(), fileHandle()];
  const open = vi.fn(async () => files.map((file) => file.handle));
  const service = createPeripheralsHost(new Map([["file-system", createFileSystemAdapter({ showOpenFilePicker: open })]]),
    createPeripheralPermissions({ storage: null, ask: async () => ({ allow: true, remember: false }) }));
  const options = { multiple: true, types: [{ accept: { "text/plain": [".txt"] } }], startIn: "documents" };
  const handles = await createFileSystemClient(service).showOpenFilePicker(options);
  expect(open).toHaveBeenCalledWith(options);
  expect(handles).toHaveLength(2);
  const writer = await handles[1].createWritable({ keepExistingData: true });
  await writer.write(" plus edits"); await writer.close();
  expect(files[1].native.createWritable).toHaveBeenCalledWith({ keepExistingData: true });
  expect(files[1].contents()).toBe("initial plus edits");
  expect(files[0].contents()).toBe("initial");
});

it("uses native stream locking, queued writes and pipeTo", async () => {
  const s = setup(); const handle = await s.client.showSaveFilePicker();
  const stream = await handle.createWritable();
  expect(stream).toBeInstanceOf(WritableStream);
  const writer = stream.getWriter();
  await expect(stream.write("locked out")).rejects.toBeInstanceOf(TypeError);
  await writer.write("one"); writer.releaseLock();
  await Promise.all([stream.write("two"), stream.write("three")]);
  await stream.close();
  expect(s.contents()).toBe("onetwothree");
  await expect(stream.write("too late")).rejects.toThrow();
  const piped = await handle.createWritable();
  await new ReadableStream({ start(controller) { controller.enqueue("piped"); controller.close(); } }).pipeTo(piped);
  expect(s.contents()).toBe("piped");
});

it("forwards binary chunks, seek, truncate and structured writes to the native writer", async () => {
  const s = setup(); const stream = await (await s.client.showSaveFilePicker()).createWritable();
  const chunks: FileSystemWriteChunkType[] = [new Uint8Array([65, 66]), new Blob(["test"]),
    { type: "write", position: 3, data: "edit" }];
  for (const chunk of chunks) await stream.write(chunk);
  await stream.seek(1); await stream.truncate(10); await stream.close();
  expect(s.writers[0].write.mock.calls.map(([chunk]) => chunk)).toEqual([
    ...chunks, { type: "seek", position: 1 }, { type: "truncate", size: 10 },
  ]);
});

it("keeps concurrent writers independent and honors abort", async () => {
  const s = setup(); const handle = await s.client.showSaveFilePicker();
  const first = await handle.createWritable(); const second = await handle.createWritable();
  await first.write("discard"); await second.write("commit");
  await first.abort(); await second.close();
  expect(s.contents()).toBe("commit");
  expect(s.writers[0].abort).toHaveBeenCalledTimes(1);
});

it("rejects pending reads immediately on revocation and discards late snapshots", async () => {
  const s = setup(); const handle = await s.client.showSaveFilePicker();
  let complete!: (file: File) => void;
  s.native.getFile.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  const pending = handle.getFile();
  const rejected = expect(pending).rejects.toMatchObject({ name: "NotAllowedError" });
  await flush(); s.permissions.revoke({ source: [], capability: "file-system" });
  await rejected; complete(new File(["late"], "test.html")); await flush();
});

it("does not time out a slow native writer prompt", async () => {
  vi.useFakeTimers();
  try {
    const s = setup(); const handle = await s.client.showSaveFilePicker();
    let complete!: (writer: never) => void;
    s.native.createWritable.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const opened = vi.fn();
    const pending = handle.createWritable().then((writer) => { opened(); return writer; });
    await flush(); await vi.advanceTimersByTimeAsync(60000);
    expect(opened).not.toHaveBeenCalled();
    const native = { write: vi.fn(async () => {}), close: vi.fn(async () => {}), abort: vi.fn(async () => {}) };
    complete(native as never);
    const writer = await pending; await writer.close();
    expect(native.close).toHaveBeenCalledTimes(1);
  } finally { vi.useRealTimers(); }
});

it("propagates native failures and aborts a writer after a failed write", async () => {
  const s = setup(); const handle = await s.client.showSaveFilePicker();
  const stream = await handle.createWritable();
  s.writers[0].write.mockRejectedValueOnce(new DOMException("Disk is full.", "QuotaExceededError"));
  await expect(stream.write("new content")).rejects.toMatchObject({ name: "QuotaExceededError" });
  expect(s.writers[0].abort).toHaveBeenCalledTimes(1);
  expect(s.contents()).toBe("initial");
  expect(await (await handle.getFile()).text()).toBe("initial");
  s.save.mockRejectedValueOnce(new DOMException("Cancelled.", "AbortError"));
  await expect(s.client.showSaveFilePicker()).rejects.toMatchObject({ name: "AbortError" });
});

it("acknowledges commands before native operations finish and rejects unknown targets", async () => {
  const file = fileHandle();
  let complete!: (file: File) => void;
  file.native.getFile.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
  const update = vi.fn();
  const session = createFileSystemAdapter({ showSaveFilePicker: async () => file.handle })
    .prepare("showSaveFilePicker", [{}]).start(update);
  await flush();
  await session.send!({ id: 1, method: "getFile", target: 0, args: [] });
  await flush();
  expect(update).toHaveBeenCalledTimes(1); // Selection only; no read result yet.
  complete(new File(["test"], "test.html")); await flush();
  expect(update).toHaveBeenLastCalledWith({ type: "data", value: { type: "result", id: 1, value: expect.any(File) } });
  await session.send!({ id: 2, method: "getFile", target: 999, args: [] }); await flush();
  expect(update).toHaveBeenLastCalledWith({ type: "data", value: { type: "result", id: 2,
    error: { name: "TypeError", message: "Unknown file handle." } } });
  await expect(session.send!({ id: 3, method: "remove", target: 0, args: [] })).rejects.toThrow("Invalid file command");
  session.stop();
});

it("installs the regular picker API and releases its files on pagehide", async () => {
  const s = setup();
  const { installFileSystemAdapter } = await import("../src/bridges/peripherals/adapters/filesystem/child");
  const host = window as Window & { showSaveFilePicker?: ReturnType<typeof createFileSystemClient>["showSaveFilePicker"];
    showOpenFilePicker?: ReturnType<typeof createFileSystemClient>["showOpenFilePicker"] };
  installFileSystemAdapter(s.service);
  try {
    const handle = await host.showSaveFilePicker!();
    const writer = await handle.createWritable();
    window.dispatchEvent(new Event("pagehide"));
    expect(s.writers[0].abort).toHaveBeenCalledTimes(1);
    await expect(handle.getFile()).rejects.toMatchObject({ name: "AbortError" });
    await expect(writer.write("after navigation")).rejects.toThrow();
  } finally { delete host.showSaveFilePicker; delete host.showOpenFilePicker; }
});

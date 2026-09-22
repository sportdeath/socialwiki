import type { PeripheralSession, PeripheralsService } from "../../shared";
import { fileException, type FileCommand, type FileResult, type HandleDescriptor, type FilePermissionOptions } from "./shared";

// Use the browser's stream implementation for locking, ordering, piping and errors.
class FileWritable extends WritableStream<FileSystemWriteChunkType> {
  async write(data: FileSystemWriteChunkType) {
    const writer = this.getWriter();
    const result = writer.write(data);
    writer.releaseLock();
    return result;
  }
  seek(position: number) { return this.write({ type: "seek", position }); }
  truncate(size: number) { return this.write({ type: "truncate", size }); }
}

type Handle = {
  readonly kind: FileSystemHandleKind;
  readonly name: string;
  queryPermission(options?: FilePermissionOptions): Promise<PermissionState>;
  requestPermission(options?: FilePermissionOptions): Promise<PermissionState>;
  isSameEntry(other: Handle): Promise<boolean>;
};
type FileHandle = Handle & {
  readonly kind: "file";
  getFile(): Promise<File>;
  createWritable(options?: FileSystemCreateWritableOptions): Promise<FileWritable>;
};
type DirectoryHandle = Handle & AsyncIterable<[string, FileHandle | DirectoryHandle]> & {
  readonly kind: "directory";
  getFileHandle(name: string, options?: FileSystemGetFileOptions): Promise<FileHandle>;
  getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions): Promise<DirectoryHandle>;
  removeEntry(name: string, options?: FileSystemRemoveOptions): Promise<void>;
  resolve(other: Handle): Promise<string[] | null>;
  entries(): AsyncGenerator<[string, FileHandle | DirectoryHandle]>;
  keys(): AsyncGenerator<string>;
  values(): AsyncGenerator<FileHandle | DirectoryHandle>;
};

export function installFileSystemAdapter(service: PeripheralsService) {
  const client = createFileSystemClient(service);
  for (const method of ["showSaveFilePicker", "showOpenFilePicker", "showDirectoryPicker"] as const) {
    if (service.features.filePickers?.includes(method)) {
      Object.defineProperty(window, method, { configurable: true, writable: true, value: client[method] });
    } else {
      delete (window as unknown as Record<string, unknown>)[method];
    }
  }
  window.addEventListener("pagehide", client.disconnect);
}

export function createFileSystemClient(service: Pick<PeripheralsService, "start">) {
  const sessions = new Set<() => void>();
  const references = new WeakMap<Handle, string>();
  function reference(handle: Handle) {
    const token = references.get(handle);
    if (!token) throw new TypeError("Expected a file system handle.");
    return token;
  }
  function pick(method: string, options: object) {
    if (options && typeof options === "object" && "startIn" in options && typeof options.startIn === "object" && options.startIn) {
      options = { ...options, startIn: { token: reference(options.startIn as Handle) } };
    }
    return new Promise<(FileHandle | DirectoryHandle)[]>((resolve, reject) => {
      let session: PeripheralSession | undefined;
      let ended: unknown;
      let nextId = 1;
      const pending = new Map<number, { resolve(value: unknown): void; reject(error: unknown): void }>();
      const streams = new Set<WritableStreamDefaultController>();
      const disconnect = () => finish(new DOMException("File access ended.", "AbortError"));
      function finish(error: unknown) {
        if (ended) return;
        ended = error;
        session?.stop(); sessions.delete(disconnect);
        reject(error);
        for (const call of pending.values()) call.reject(error);
        pending.clear();
        for (const controller of streams) controller.error(error);
        streams.clear();
      }
      function call(method: FileCommand["method"], target: number, ...args: unknown[]) {
        if (ended) return Promise.reject(ended);
        const id = nextId++;
        return new Promise<unknown>((resolve, reject) => {
          pending.set(id, { resolve, reject });
          void session!.send!({ id, method, target, args }).catch(finish);
        });
      }
      function fileHandle({ id, name, kind, token }: HandleDescriptor): FileHandle | DirectoryHandle {
        const base: Handle = { kind, name,
          queryPermission: (options) => ended ? Promise.resolve("denied") : call("queryPermission", id, options) as Promise<PermissionState>,
          requestPermission: (options) => ended ? Promise.resolve("denied") : call("requestPermission", id, options) as Promise<PermissionState>,
          isSameEntry: async (other) => call("isSameEntry", id, reference(other)) as Promise<boolean>,
        };
        async function* entries(): AsyncGenerator<[string, FileHandle | DirectoryHandle]> {
          const iterator = await call("entries", id) as number;
          try {
            while (true) {
              const item = await call("next", iterator) as IteratorResult<[string, HandleDescriptor]>;
              if (item.done) return;
              yield [item.value[0], fileHandle(item.value[1])];
            }
          } finally { if (!ended) await call("return", iterator); }
        }
        const handle: FileHandle | DirectoryHandle = kind === "directory" ? {
          ...base, kind,
          getFileHandle: async (name, options) => fileHandle(await call("getFileHandle", id, name, options) as HandleDescriptor) as FileHandle,
          getDirectoryHandle: async (name, options) => fileHandle(await call("getDirectoryHandle", id, name, options) as HandleDescriptor) as DirectoryHandle,
          removeEntry: async (name, options) => { await call("removeEntry", id, name, options); },
          resolve: async (other) => call("resolve", id, reference(other)) as Promise<string[] | null>,
          entries,
          async *keys() { for await (const [name] of entries()) yield name; },
          async *values() { for await (const [, value] of entries()) yield value; },
          [Symbol.asyncIterator]: entries,
        } : { ...base, kind,

          getFile: () => call("getFile", id) as Promise<File>,
          async createWritable(options?: FileSystemCreateWritableOptions) {
            const writer = await call("createWritable", id, options) as number;
            if (ended) throw ended;
            let controller: WritableStreamDefaultController;
            const operation = async (method: "write" | "close" | "abort", ...args: unknown[]) => {
              try { await call(method, writer, ...args); }
              catch (error) { streams.delete(controller); throw error; }
              if (method !== "write") streams.delete(controller);
            };
            return new FileWritable({
              start(value) { controller = value; streams.add(value); },
              write: (data) => operation("write", data),
              close: () => operation("close"),
              abort: (reason) => operation("abort", reason),
            });
          },
        };
        references.set(handle, token);
        return Object.freeze(handle);
      }
      sessions.add(disconnect);
      try {
        session = service.start({ source: [], capability: "file-system", method, args: [options] }, (event) => {
          if (ended) return;
          if (event.type !== "data") {
            finish(event.type === "error" ? fileException(event) : new DOMException("File access ended.", "AbortError"));
            return;
          }
          const result = event.value as FileResult;
          if (result.type === "selected") resolve(result.files.map(fileHandle));
          else {
            const call = pending.get(result.id);
            pending.delete(result.id);
            if (result.error) call?.reject(fileException(result.error));
            else call?.resolve(result.value);
          }
        });
        if (ended) session.stop();
      } catch (error) { finish(error); }
    });
  }
  return {
    showSaveFilePicker: async (options: object = {}) => (await pick("showSaveFilePicker", options))[0] as FileHandle,
    showOpenFilePicker: async (options: object = {}) => await pick("showOpenFilePicker", options) as FileHandle[],
    showDirectoryPicker: async (options: object = {}) => (await pick("showDirectoryPicker", options))[0] as DirectoryHandle,
    disconnect() { for (const stop of sessions) stop(); },
  };
}

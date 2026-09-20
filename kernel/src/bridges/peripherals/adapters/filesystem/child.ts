import type { PeripheralSession, PeripheralsService } from "../../shared";
import { fileException, type FileCommand, type FileResult } from "./shared";

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

type FileHandle = Pick<FileSystemFileHandle, "kind" | "name" | "getFile"> & {
  createWritable(options?: FileSystemCreateWritableOptions): Promise<FileWritable>;
};

export function installFileSystemAdapter(service: PeripheralsService) {
  const client = createFileSystemClient(service);
  for (const method of ["showSaveFilePicker", "showOpenFilePicker"] as const) {
    Object.defineProperty(window, method, { configurable: true, writable: true, value: client[method] });
  }
  window.addEventListener("pagehide", client.disconnect);
}

export function createFileSystemClient(service: Pick<PeripheralsService, "start">) {
  const sessions = new Set<() => void>();
  function pick(method: string, options: object) {
    return new Promise<FileHandle[]>((resolve, reject) => {
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
      function fileHandle({ id, name }: { id: number; name: string }) {
        return Object.freeze({ kind: "file" as const, name,
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
        });
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
    showSaveFilePicker: async (options: object = {}) => (await pick("showSaveFilePicker", options))[0],
    showOpenFilePicker: (options: object = {}) => pick("showOpenFilePicker", options),
    disconnect() { for (const stop of sessions) stop(); },
  };
}

import type { HostAdapter } from "../../shared";
import { permissionKey } from "../../permissions";
import { fileMethods, fileFailure, type HandleDescriptor, type NativeHandle, type FilePermissionOptions, type FileCommand, type FilePickers, type FileResult } from "./shared";

export function createFileSystemAdapter(pickers: FilePickers = window as FilePickers): HostAdapter {
  const references = new Map<string, { handle: NativeHandle; scope: string }>();
  return {
    features: { filePickers: ["showOpenFilePicker", "showSaveFilePicker", "showDirectoryPicker"]
      .filter((key) => typeof pickers[key as keyof FilePickers] === "function") },
    prepare(method, args, context) {
      if (!["showSaveFilePicker", "showOpenFilePicker", "showDirectoryPicker"].includes(method) || args.length !== 1) {
        throw new TypeError("Unknown file picker.");
      }
      let options = args[0] as Record<string, unknown> | undefined;
      const scope = permissionKey({ source: context?.source ?? [], capability: "file-system" });
      const lookup = (token: unknown) => {
        const entry = references.get(String(token));
        if (!entry || entry.scope !== scope) throw new TypeError("Unknown file handle.");
        return entry.handle;
      };
      if (options != null && typeof options !== "object") throw new TypeError("Invalid file picker options.");
      if (options?.startIn && typeof options.startIn === "object") {
        options = { ...options, startIn: lookup((options.startIn as { token: string }).token) };
      }
      const picker = pickers[method as keyof FilePickers] as ((options?: object) => Promise<FileSystemHandle | FileSystemHandle[]>) | undefined;
      return {
        permissions: picker ? [{ capability: "file-system", label: "local files" }] : [],
        start(update) {
          let stopped = false;
          let nextWriter = 1;
          let nextHandle = 0;
          let nextIterator = 1;
          const handles = new Map<number, NativeHandle>();
          const tokens = new Set<string>();
          const iterators = new Map<number, AsyncIterableIterator<[string, FileSystemHandle]>>();
          const describe = (handle: FileSystemHandle): HandleDescriptor => {
            const id = nextHandle++;
            const token = crypto.randomUUID();
            handles.set(id, handle as NativeHandle); tokens.add(token);
            references.set(token, { handle: handle as NativeHandle, scope });
            return { id, token, kind: handle.kind, name: handle.name };
          };
          const writers = new Map<number, FileSystemWritableFileStream>();
          const live = () => { if (stopped) throw new DOMException("File access ended.", "NotAllowedError"); };
          const deliver = (value: FileResult) => { if (!stopped) update({ type: "data", value }); };
          const stop = () => {
            if (stopped) return;
            stopped = true;
            for (const writer of writers.values()) void writer.abort().catch(() => {});
            for (const iterator of iterators.values()) void iterator.return?.().catch(() => {});
            for (const token of tokens) references.delete(token);
            tokens.clear(); iterators.clear(); writers.clear(); handles.clear();
          };
          void (async () => {
            if (!picker) throw new DOMException("This browser does not support local file pickers.", "NotSupportedError");
            const result = await picker.call(pickers, options ?? undefined);
            if (stopped) return; // Native picker UI cannot be programmatically dismissed.
            const files = (Array.isArray(result) ? result : [result]).map(describe);
            deliver({ type: "selected", files });
          })().catch((error) => {
            if (!stopped) update({ type: "error", ...fileFailure(error) });
            stop();
          });

          async function execute({ method, target, args }: FileCommand) {
            live();
            if (method === "next" || method === "return") {
              const iterator = iterators.get(target);
              if (!iterator) return { done: true };
              if (method === "return") { iterators.delete(target); await iterator.return?.(); return; }
              const item = await iterator.next(); live();
              if (item.done) { iterators.delete(target); return { done: true }; }
              return { done: false, value: [item.value[0], describe(item.value[1])] };
            }
            if (!["write", "close", "abort"].includes(method)) {
              const handle = handles.get(target);
              if (!handle) throw new TypeError("Unknown file handle.");
              if (method === "queryPermission" || method === "requestPermission") {
                const state = await handle[method](args[0] as FilePermissionOptions); live(); return state;
              }
              if (method === "isSameEntry") return handle.isSameEntry(lookup(args[0]));
              if (handle.kind === "directory") {
                switch (method) {
                  case "getFileHandle": case "getDirectoryHandle": {
                    const child = await handle[method](args[0] as string, args[1] as object); live(); return describe(child);
                  }
                  case "removeEntry": await handle.removeEntry(args[0] as string, args[1] as FileSystemRemoveOptions); live(); return;
                  case "resolve": return handle.resolve(lookup(args[0]));
                  case "entries": {
                    const id = nextIterator++; iterators.set(id, handle.entries()); return id;
                  }
                  default: throw new TypeError("Invalid directory operation.");
                }
              }
              if (method === "getFile") {
                const file = await handle.getFile(); live(); return file;
              }
              if (method !== "createWritable") throw new TypeError("Invalid file operation.");
              const writer = await handle.createWritable(args[0] as FileSystemCreateWritableOptions | undefined);
              if (stopped) { await writer.abort(); live(); }
              const id = nextWriter++;
              writers.set(id, writer);
              return id;
            }
            const writer = writers.get(target);
            if (!writer) throw new DOMException("The file writer is closed.", "InvalidStateError");
            try {
              switch (method) {
                case "write": await writer.write(args[0] as FileSystemWriteChunkType); break;
                case "close": await writer.close(); writers.delete(target); break;
                case "abort": await writer.abort(args[0]); writers.delete(target); break;
                default: throw new TypeError("Unknown file operation.");
              }
              live();
            } catch (error) {
              if (writers.delete(target)) await writer.abort().catch(() => {});
              throw error;
            }
          }
          // Acknowledge commands immediately; results use the existing update channel.
          // Native permission prompts and disk I/O must not inherit the RPC timeout.
          let queue = Promise.resolve();
          return { stop, async send(message) {
            live();
            const command = message as FileCommand;
            if (!command || !Number.isSafeInteger(command.id) || !Number.isSafeInteger(command.target) ||
              !Array.isArray(command.args) || !fileMethods.includes(command.method)) {
              throw new TypeError("Invalid file command.");
            }
            queue = queue.then(async () => {
              try { deliver({ type: "result", id: command.id, value: await execute(command) }); }
              catch (error) { deliver({ type: "result", id: command.id, error: fileFailure(error) }); }
            });
          } };
        },
      };
    },
  };
}

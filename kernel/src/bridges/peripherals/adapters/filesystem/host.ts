import type { HostAdapter } from "../../shared";
import { fileFailure, type FileCommand, type FilePickers, type FileResult } from "./shared";

export function createFileSystemAdapter(pickers: FilePickers = window as FilePickers): HostAdapter {
  return { prepare(method, args) {
    if ((method !== "showSaveFilePicker" && method !== "showOpenFilePicker") || args.length !== 1) {
      throw new TypeError("Unknown file picker.");
    }
    const options = args[0];
    if (options != null && typeof options !== "object") throw new TypeError("Invalid file picker options.");
    const picker = pickers[method] as ((options?: object) => Promise<FileSystemFileHandle | FileSystemFileHandle[]>) | undefined;
    return {
      permissions: picker ? [{ capability: "file-system", label: "local files" }] : [],
      start(update) {
        let stopped = false;
        let nextWriter = 1;
        const handles = new Map<number, FileSystemFileHandle>();
        const writers = new Map<number, FileSystemWritableFileStream>();
        const live = () => { if (stopped) throw new DOMException("File access ended.", "NotAllowedError"); };
        const deliver = (value: FileResult) => { if (!stopped) update({ type: "data", value }); };
        const stop = () => {
          if (stopped) return;
          stopped = true;
          for (const writer of writers.values()) void writer.abort().catch(() => {});
          writers.clear(); handles.clear();
        };
        void (async () => {
          if (!picker) throw new DOMException("This browser does not support local file pickers.", "NotSupportedError");
          const result = await picker.call(pickers, options ?? undefined);
          if (stopped) return; // Native picker UI cannot be programmatically dismissed.
          const files = (Array.isArray(result) ? result : [result]).map((handle, id) => {
            handles.set(id, handle);
            return { id, name: handle.name };
          });
          deliver({ type: "selected", files });
        })().catch((error) => {
          if (!stopped) update({ type: "error", ...fileFailure(error) });
          stop();
        });

        async function execute({ method, target, args }: FileCommand) {
          live();
          if (method === "getFile" || method === "createWritable") {
            const handle = handles.get(target);
            if (!handle) throw new TypeError("Unknown file handle.");
            if (method === "getFile") {
              const file = await handle.getFile(); live(); return file;
            }
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
            !Array.isArray(command.args) || !["getFile", "createWritable", "write", "close", "abort"].includes(command.method)) {
            throw new TypeError("Invalid file command.");
          }
          queue = queue.then(async () => {
            try { deliver({ type: "result", id: command.id, value: await execute(command) }); }
            catch (error) { deliver({ type: "result", id: command.id, error: fileFailure(error) }); }
          });
        } };
      },
    };
  } };
}

// Only values cross Penpal. Native handles and writers stay in their request.
export type FilePickers = {
  showSaveFilePicker?: (options?: object) => Promise<FileSystemFileHandle>;
  showDirectoryPicker?: (options?: object) => Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
};
export const fileMethods = ["getFile", "createWritable", "write", "close", "abort", "queryPermission", "requestPermission",
  "isSameEntry", "getFileHandle", "getDirectoryHandle", "removeEntry", "resolve", "entries", "next", "return"] as const;
export type HandleDescriptor = { id: number; kind: FileSystemHandleKind; name: string; token: string };
export type FilePermissionOptions = { mode?: "read" | "readwrite" | "write" };
type NativeDirectory = FileSystemDirectoryHandle & { entries(): AsyncIterableIterator<[string, FileSystemHandle]> };
export type NativeHandle = (FileSystemFileHandle | NativeDirectory) & {
  queryPermission(options?: FilePermissionOptions): Promise<PermissionState>;
  requestPermission(options?: FilePermissionOptions): Promise<PermissionState>;
};
export type FileCommand = {
  id: number;
  method: typeof fileMethods[number];
  target: number;
  args: unknown[];
};
export type FileFailure = { name: string; message: string };
export type FileResult =
  | { type: "selected"; files: HandleDescriptor[] }
  | { type: "result"; id: number; value?: unknown; error?: FileFailure };

export function fileFailure(error: unknown): FileFailure {
  return error instanceof Error || error instanceof DOMException
    ? { name: error.name, message: error.message }
    : { name: "UnknownError", message: "File operation failed." };
}
export function fileException(error: FileFailure) {
  return error.name === "TypeError" ? new TypeError(error.message)
    : new DOMException(error.message, error.name);
}

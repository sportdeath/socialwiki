// Only values cross Penpal. Native handles and writers stay in their request.
export type FilePickers = {
  showSaveFilePicker?: (options?: object) => Promise<FileSystemFileHandle>;
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
};
export type FileCommand = {
  id: number;
  method: "getFile" | "createWritable" | "write" | "close" | "abort";
  target: number;
  args: unknown[];
};
export type FileFailure = { name: string; message: string };
export type FileResult =
  | { type: "selected"; files: { id: number; name: string }[] }
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

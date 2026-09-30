type PickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

export function canChooseDirectory() {
  return typeof (window as PickerWindow).showDirectoryPicker === "function";
}

export function folderName(siteName: string) {
  const name = siteName.trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, "_")
    .replace(/^[. ]+|[. ]+$/g, "").slice(0, 80).replace(/[. ]+$/g, "") || "site";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(name)
    ? `_${name}` : name;
}

async function writeFile(folder: FileSystemDirectoryHandle, name: string, text: string) {
  const handle = await folder.getFileHandle(name, { create: true });
  const writer = await handle.createWritable();
  await writer.write(text);
  await writer.close();
}

export async function saveSiteFolder(siteName: string, html: string, guide: string) {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Folder access is unavailable in this browser.");
  const parent = await picker();
  const name = folderName(siteName);
  let existing = false;
  try {
    await parent.getDirectoryHandle(name);
    existing = true;
  } catch (error) {
    if (!(error instanceof DOMException) || error.name !== "NotFoundError") throw error;
  }
  if (existing) throw new Error(`“${name}” already exists. Open that folder instead.`);
  const folder = await parent.getDirectoryHandle(name, { create: true });
  await writeFile(folder, "index.html", html);
  await writeFile(folder, "AGENTS.md", guide);
  return folder;
}

export async function chooseSiteFolder() {
  const picker = (window as PickerWindow).showDirectoryPicker;
  if (!picker) throw new Error("Folder access is unavailable in this browser.");
  return picker();
}

export async function downloadSiteZip(siteName: string, html: string, guide: string) {
  // Keep ZIP tooling off the normal Edit loading path.
  const zipUrl = "https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm";
  const { zipSync, strToU8 } = await import(/* @vite-ignore */ zipUrl) as {
    zipSync(files: Record<string, Uint8Array>): Uint8Array;
    strToU8(text: string): Uint8Array;
  };
  const name = folderName(siteName);
  const bytes = zipSync({
    [`${name}/index.html`]: strToU8(html),
    [`${name}/AGENTS.md`]: strToU8(guide),
  });
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

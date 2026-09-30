import { defineComponent, onBeforeUnmount, ref, shallowRef, useTemplateRef, type PropType } from "vue";
import {
    canChooseDirectory, chooseSiteFolder, downloadSiteZip, saveSiteFolder,
} from "../local-files";

export default defineComponent({
    template: "#edit-local-template",
    props: {
        siteName: { type: String, required: true },
        html: { type: String, required: true },
        guideText: { type: String as PropType<string | null>, default: null },
        guideError: { type: String, default: "" },
        canPublish: { type: Boolean, required: true },
        publishing: { type: Boolean, required: true },
    },
    emits: ["update-html", "preview-ready", "publish", "retry-guide"],
    setup(props, { emit }) {
        const uploadInput = useTemplateRef<HTMLInputElement>("uploadInput");
        const folderAccess = canChooseDirectory();
        const folder = shallowRef<FileSystemDirectoryHandle | null>(null);
        const siteReady = ref(false);
        const busy = ref(false);
        const saveFeedback = ref("");
        const uploadFeedback = ref("");
        let feedbackTimer: number | undefined;
        let syncTimer: number | undefined;
        let lastModified: number | undefined;
        let syncing = false;
        let disposed = false;
        const errorMessage = (error: unknown) =>
            error instanceof Error ? error.message : String(error);

        function showFeedback(kind: "save" | "upload", message: string) {
            if (kind === "save") saveFeedback.value = message;
            else uploadFeedback.value = message;
            clearTimeout(feedbackTimer);
            feedbackTimer = window.setTimeout(() => {
                saveFeedback.value = "";
                uploadFeedback.value = "";
            }, 3000);
        }

        async function syncFolder() {
            if (!folder.value || syncing) return;
            const currentFolder = folder.value;
            syncing = true;
            try {
                const file = await (await currentFolder.getFileHandle("index.html")).getFile();
                if (disposed || folder.value !== currentFolder) return;
                if (lastModified !== undefined && file.lastModified !== lastModified) {
                    const html = await file.text();
                    if (disposed || folder.value !== currentFolder) return;
                    emit("update-html", html);
                    showFeedback("upload", "Synced");
                }
                lastModified = file.lastModified;
            } catch (error) {
                if (!disposed && folder.value === currentFolder)
                    showFeedback("upload", `Could not read index.html: ${errorMessage(error)}`);
            } finally {
                syncing = false;
            }
        }

        function watchFolder() {
            // The directory handle has no event for saves made by an external editor.
            if (syncTimer !== undefined) clearInterval(syncTimer);
            void syncFolder();
            syncTimer = window.setInterval(() => { void syncFolder(); }, 1500);
        }

        async function createFolder() {
            if (!props.guideText) return;
            busy.value = true;
            try {
                if (folderAccess) {
                    const selected = await saveSiteFolder(props.siteName, props.html, props.guideText);
                    if (disposed) return;
                    folder.value = selected;
                    lastModified = (await (await selected.getFileHandle("index.html")).getFile()).lastModified;
                    if (disposed) return;
                    watchFolder();
                } else {
                    await downloadSiteZip(props.siteName, props.html, props.guideText);
                    if (disposed) return;
                }
                siteReady.value = true;
                if (folderAccess) emit("preview-ready");
                showFeedback("save", folderAccess ? "Saved" : "Downloaded");
            } catch (error) {
                if (!(error instanceof DOMException && error.name === "AbortError"))
                    showFeedback("save", `Could not save: ${errorMessage(error)}`);
            } finally {
                busy.value = false;
            }
        }

        async function openExistingFolder() {
            busy.value = true;
            try {
                const selected = await chooseSiteFolder();
                const file = await (await selected.getFileHandle("index.html")).getFile();
                const html = await file.text();
                if (disposed) return;
                folder.value = selected;
                lastModified = file.lastModified;
                emit("update-html", html);
                siteReady.value = true;
                emit("preview-ready");
                showFeedback("save", "Connected");
                watchFolder();
            } catch (error) {
                if (!(error instanceof DOMException && error.name === "AbortError"))
                    showFeedback("save", `Could not open index.html: ${errorMessage(error)}`);
            } finally {
                busy.value = false;
            }
        }

        async function uploadFile(event: Event) {
            const input = event.target as HTMLInputElement;
            const file = input.files?.[0];
            if (!file) return;
            try {
                const html = await file.text();
                if (disposed) return;
                emit("update-html", html);
                siteReady.value = true;
                emit("preview-ready");
                showFeedback("upload", "Uploaded");
            } catch (error) {
                showFeedback("upload", `Could not read the file: ${errorMessage(error)}`);
            } finally {
                input.value = "";
            }
        }

        onBeforeUnmount(() => {
            disposed = true;
            clearTimeout(feedbackTimer);
            clearInterval(syncTimer);
        });

        return {
            uploadInput, folderAccess, folder, siteReady, busy, saveFeedback, uploadFeedback,
            createFolder, openExistingFolder, uploadFile,
        };
    },
});

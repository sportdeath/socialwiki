<template>
    <main>
        <TwoPaneLayout left-title="Editor" right-title="Preview">
            <template #left-controls>
                <nav>
                    <ul>
                        <li>
                            <button @click="download()">Download</button>
                        </li>
                        <li>
                            <button
                                :class="{ selected: showDiff }"
                                @click="showDiff = !showDiff"
                            >
                                {{ showDiff ? "Hide changes" : "Show changes" }}
                            </button>
                        </li>
                        <li>
                            <button
                                :class="{ selected: showSettings }"
                                @click="showSettings = !showSettings"
                                title="Editor settings"
                            >
                                ⚙️▼
                            </button>
                        </li>
                    </ul>
                </nav>
            </template>

            <template #right-controls>
                <nav>
                    <ul>
                        <li>
                            <button
                                title="Refresh the preview"
                                @click="refreshPreview"
                            >
                                {{ debouncing ? "Refreshing…" : "Refresh" }}
                            </button>
                        </li>
                        <li>
                            <button
                                @click="showPreviewMenu = !showPreviewMenu"
                                :class="{ selected: showPreviewMenu }"
                                title="Preview settings"
                            >
                                ⚙️▼
                            </button>
                        </li>
                    </ul>
                </nav>
            </template>

            <!-- Left pane body (Editor) -->
            <template #left-pane>
                <div class="pane">
                    <section v-if="showSettings" class="settings-panel">
                        <div class="settings-group">
                            <h3>Appearance</h3>
                            <label>
                                Theme
                                <select v-model="editorTheme">
                                    <option value="vs-dark">Dark</option>
                                    <option value="vs">Light</option>
                                    <option value="hc-black">
                                        High contrast
                                    </option>
                                </select>
                            </label>
                            <label>
                                Font size
                                <input
                                    type="number"
                                    min="10"
                                    max="24"
                                    v-model.number="fontSize"
                                />
                            </label>
                            <label>
                                Line height
                                <input
                                    type="number"
                                    min="1"
                                    max="5"
                                    step="0.1"
                                    v-model.number="lineHeight"
                                />
                            </label>
                        </div>

                        <div class="settings-group">
                            <h3>Editor UI</h3>
                            <label class="checkbox-inline">
                                <input type="checkbox" v-model="wordWrap" />
                                Word wrap
                            </label>
                            <label class="checkbox-inline">
                                <input
                                    type="checkbox"
                                    v-model="minimapEnabled"
                                />
                                Show minimap
                            </label>
                            <label class="checkbox-inline">
                                <input
                                    type="checkbox"
                                    v-model="renderWhitespace"
                                />
                                Show whitespace
                            </label>
                        </div>
                    </section>

                    <CodeEditor
                        v-if="!showDiff"
                        v-model:value="editorHtml"
                        language="html"
                        :theme="editorTheme"
                        :options="monacoOptions"
                        class="code-editor"
                    />
                    <!-- @editorDidMount="onEditorDidMount" -->

                    <DiffEditor
                        v-else
                        :value="diffHtml"
                        :original="draftHtml"
                        language="html"
                        :theme="editorTheme"
                        :options="diffOptions"
                        @change="onDiffChange"
                        @editorDidMount="onDiffDidMount"
                        class="code-editor"
                    />
                </div>
            </template>

            <!-- Right pane body (Preview) -->
            <template #right-pane>
                <div class="pane">
                    <section v-if="showPreviewMenu" class="settings-panel">
                        <label class="checkbox-inline">
                            <input type="checkbox" v-model="livePreview" />
                            Auto-Refresh
                        </label>
                    </section>
                    <sw-transclude
                        :key="refreshKey"
                        :srcdoc="previewHtml"
                    ></sw-transclude>
                </div>
            </template>
        </TwoPaneLayout>

        <template v-if="$graffitiSession.value === null">
            <dialog open>
                <form @submit.prevent="">
                    <button @click="$graffiti.login()">Log in to edit</button>
                    <button
                        @click="$router.push(`/${pageName}`)"
                        class="secondary"
                    >
                        Cancel
                    </button>
                </form>
            </dialog>
            <div
                class="dialog-backdrop"
                @click="$router.push(`/${pageName}`)"
            ></div>
        </template>
    </main>
</template>

<script setup lang="ts">
import "../../style.css";
import { ref, toRef, watch, computed, onBeforeUnmount, onMounted } from "vue";
import * as monaco from "monaco-editor";
import { CodeEditor, DiffEditor } from "monaco-editor-vue3";
import TwoPaneLayout from "../TwoPaneLayout.vue";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import { createPageVersion } from "../../backend/page-versions";
import type { GraffitiSession } from "@graffiti-garden/api";
import { initVimMode } from "monaco-vim";

const props = defineProps<{
    pageName: string;
}>();
const pageName = toRef(props, "pageName");

const template = `<!doctype html>
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <script src="${window.location.origin}/init.js"><\/script>
</head>

<body>
    <h1>Your app here!</h1>
</body>`;

let draftHtml = template;

// Initialize the editor, diff and preview with the existing HTML
const editorHtml = ref(draftHtml);
const previewHtml = ref(draftHtml);
const diffHtml = ref(draftHtml);

function download() {
    const blob = new Blob([editorHtml.value], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${encodeURIComponent(pageName.value)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Editor Settings ------------------------------------
const showSettings = ref(false);

type MonacoTheme = "vs-dark" | "vs" | "hc-black";
const editorTheme = ref<MonacoTheme>("vs-dark");

const wordWrap = ref(true);
const minimapEnabled = ref(true);
const renderWhitespace = ref(false);
const fontSize = ref(14);
const lineHeight = ref(1.5);

// Apply Monaco theme globally when selection changes
watch(editorTheme, (theme) => monaco.editor.setTheme(theme), {
    immediate: true,
});

const monacoOptions = computed(() => ({
    lineNumbers: "on",
    automaticLayout: true,
    wordWrap: wordWrap.value ? "on" : "off",
    minimap: { enabled: minimapEnabled.value },
    fontSize: fontSize.value,
    lineHeight: lineHeight.value,
    renderWhitespace: renderWhitespace.value ? "all" : "none",
    smoothScrolling: true,
    scrollBeyondLastLine: true,
    mouseWheelZoom: true,
    quickSuggestions: true,
    suggestOnTriggerCharacters: true,
    tabCompletion: "on",
    parameterHints: { enabled: true },
    lineNumbersMinChars: 3,
}));

// TODO: add toggle for VIM
// function onEditorDidMount(editor: any) {
//     const vimMode = initVimMode(editor, null);
// }

// --- Diff settings ------------------------------------

// Keep the editor and diff HTML in sync (v-model does not work)
const showDiff = ref(false);
watch(showDiff, (enabled) => {
    if (enabled) {
        diffHtml.value = editorHtml.value;
    }
});
const onDiffChange = (value: string) => {
    editorHtml.value = value;
};

// Keep diff editor options in sync reactively
const diffOptions = computed(() => ({
    ...monacoOptions.value,
    renderSideBySide: false,
}));
const diffEditorInstance = ref<monaco.editor.IStandaloneDiffEditor | null>(
    null,
);
const onDiffDidMount = (editor: monaco.editor.IStandaloneDiffEditor) => {
    diffEditorInstance.value = editor;
};
watch(
    monacoOptions,
    (opts) => {
        if (!diffEditorInstance.value) return;
        const modified = diffEditorInstance.value.getModifiedEditor();
        const original = diffEditorInstance.value.getOriginalEditor();

        // @ts-ignore
        modified.updateOptions(opts);
        // @ts-ignore
        original.updateOptions(opts);
    },
    { deep: true },
);

// --- Preview updates -----------------------------

// Manually refresh the preview
const refreshKey = ref(0);
function refreshPreview() {
    previewHtml.value = editorHtml.value;
    refreshKey.value++;
}

// Preview menu state and option
const showPreviewMenu = ref(false);
const livePreview = ref(true);

// Auto-refresh the preview
const DEBOUNCE_DELAY = 500;
let timeout: number | null = null;
onBeforeUnmount(() => {
    if (timeout !== null) clearTimeout(timeout);
});
const debouncing = ref(false);
const schedulePreviewUpdate = (newHtml: string) => {
    debouncing.value = true;
    if (timeout !== null) clearTimeout(timeout);
    timeout = window.setTimeout(() => {
        previewHtml.value = newHtml;
        debouncing.value = false;
        timeout = null;
    }, DEBOUNCE_DELAY);
};
watch(editorHtml, (newHtml) => {
    if (!livePreview.value) return;
    schedulePreviewUpdate(newHtml);
});

// When auto-refresh is turned on, refresh once immediately
watch(livePreview, (enabled, oldVal) => {
    if (enabled && !oldVal) refreshPreview();
});

// --- Publishing ----------------------------------------------
const beforeUnload = (event: BeforeUnloadEvent) => {
    if (editorHtml.value === draftHtml) return;

    event.preventDefault();
    event.returnValue = "";
};
onMounted(() => {
    window.addEventListener("beforeunload", beforeUnload);
});
onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", beforeUnload);
});

const publishing = ref(false);
async function publish(session: GraffitiSession, as?: boolean) {
    publishing.value = true;
    const publishName = as
        ? prompt("What page name do you want to publish to?", pageName.value)
        : pageName.value;
    if (publishName === null) {
        publishing.value = false;
        return;
    }
    const summary = prompt("Edit summary (Briefly describe your changes)");
    if (summary === null) {
        publishing.value = false;
        return;
    }
    const publishedHtml = editorHtml.value;
    await createPageVersion(
        graffiti,
        publishName,
        publishedHtml,
        [],
        summary,
        session,
    );

    draftHtml = publishedHtml;
    router.push(`/w/${publishName}`);
    publishing.value = false;
}

const loggingIn = ref(false);
const graffiti = useGraffiti();
function login() {
    loggingIn.value = true;
    graffiti.login().finally(() => {
        loggingIn.value = false;
    });
}
</script>

<style scoped>
.pane {
    width: 100%;
    display: flex;
    flex-direction: column;
}

.code-editor {
    flex: 1;
    min-height: 0;
}

/* Settings panel (in editor pane) */
.settings-panel {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem 1.25rem;
    padding: 0.6rem 0.9rem 0.8rem;
    border-top: 1px solid var(--border-color);
    font-size: 0.83rem;
    border-bottom: 1px solid var(--border-color);

    h3 {
        font-size: 0.8rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        opacity: 0.8;
    }

    label {
        display: inline-flex;
        flex-direction: column;
        gap: 0.2rem;
    }

    label.checkbox-inline {
        flex-direction: row;
        align-items: center;
        gap: 0.35rem;
        cursor: pointer;
    }

    input[type="number"],
    select {
        border-radius: 6px;
        border: 1px solid var(--border-color);
        padding: 0.2rem 0.4rem;
        color: inherit;
        font-size: inherit;
    }

    .settings-group {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
}

main {
    position: relative;

    dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border-radius: 0.5rem;
        z-index: 1000;
        padding: 2rem;
        background: var(--background-color);
        border: 2px solid var(--border-color);
        width: max-content;
        max-width: 90dvw;

        form {
            display: flex;
            flex-direction: column;
            gap: 2rem;
            font-size: 2rem;
        }
    }

    .dialog-backdrop {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #000000cc;
        z-index: 10;
    }
}
</style>

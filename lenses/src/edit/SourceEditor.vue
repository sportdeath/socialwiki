<template>
    <TwoPaneLayout left-title="Editor" right-title="Preview">
        <template #left-controls>
            <nav class="editor-controls">
                <ul class="editor-toolbar">
                    <li>
                        <button
                            type="button"
                            class="publish-button"
                            :class="{ 'publish-shake': shouldShakePublish }"
                            :disabled="publishing"
                            @click="emit('publish')"
                        >
                            Publish
                        </button>
                    </li>

                    <li>
                        <button type="button" @click="emit('download')">
                            Download
                        </button>
                    </li>

                    <li>
                        <details
                            ref="viewMenuDetails"
                            @keydown.esc.stop.prevent="closeViewMenu"
                        >
                            <summary>▾ View</summary>

                            <ul class="editor-menu">
                                <li>
                                    <label class="menu-checkbox">
                                        <input
                                            type="checkbox"
                                            v-model="showDiff"
                                        />
                                        Show changes
                                    </label>
                                </li>

                                <li
                                    class="menu-separator"
                                    aria-hidden="true"
                                ></li>

                                <li>
                                    <label class="menu-checkbox">
                                        <input
                                            type="checkbox"
                                            v-model="darkMode"
                                        />
                                        Dark mode
                                    </label>
                                </li>

                                <li>
                                    <label class="menu-checkbox">
                                        <input
                                            type="checkbox"
                                            v-model="wordWrap"
                                        />
                                        Word wrap
                                    </label>
                                </li>

                                <li>
                                    <label class="menu-checkbox">
                                        <input
                                            type="checkbox"
                                            v-model="minimapEnabled"
                                        />
                                        Show minimap
                                    </label>
                                </li>

                                <li>
                                    <label class="menu-checkbox">
                                        <input
                                            type="checkbox"
                                            v-model="renderWhitespace"
                                        />
                                        Show whitespace
                                    </label>
                                </li>

                                <li>
                                    <label class="menu-checkbox">
                                        <input
                                            type="checkbox"
                                            v-model="vimModeEnabled"
                                        />
                                        Vim mode
                                    </label>
                                </li>
                            </ul>
                        </details>
                    </li>
                </ul>
            </nav>
        </template>

        <template #right-controls><slot name="preview-controls" /></template>

        <!-- Left pane body (Editor) -->
        <template #left-pane>
            <div class="pane">
                <div
                    v-show="!showDiff"
                    ref="codeEditorElement"
                    class="code-editor"
                ></div>

                <div
                    v-show="showDiff"
                    ref="diffEditorElement"
                    class="code-editor"
                ></div>
            </div>
        </template>

        <template #right-pane><slot name="preview" /></template>
    </TwoPaneLayout>
</template>

<script setup lang="ts">
import {
    ref,
    shallowRef,
    computed,
    watch,
    nextTick,
    onMounted,
    onBeforeUnmount,
} from "vue";
import * as monaco from "monaco-editor";
import { initVimMode, type VimAdapterInstance } from "monaco-vim";
import "./toolbar.css";
import TwoPaneLayout from "../utils/TwoPaneLayout.vue";

const editorHtml = defineModel<string>({ required: true });
const props = defineProps<{
    baseline: string;
    publishing: boolean;
    shouldShakePublish: boolean;
}>();
const emit = defineEmits<{ publish: []; download: [] }>();

// --- Editor Settings ------------------------------------
type MonacoTheme = "vs-dark" | "vs";
const editorTheme = ref<MonacoTheme>("vs-dark");
const darkMode = computed({
    get: () => editorTheme.value === "vs-dark",
    set: (enabled: boolean) => {
        editorTheme.value = enabled ? "vs-dark" : "vs";
    },
});

const wordWrap = ref(true);
const minimapEnabled = ref(true);
const renderWhitespace = ref(false);
const vimModeEnabled = ref(false);

// Apply Monaco theme globally when selection changes
watch(editorTheme, (theme) => monaco.editor.setTheme(theme), {
    immediate: true,
});

const monacoOptions =
    computed<monaco.editor.IStandaloneEditorConstructionOptions>(() => ({
        lineNumbers: "on",
        automaticLayout: true,
        wordWrap: wordWrap.value ? "on" : "off",
        minimap: { enabled: minimapEnabled.value },
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

const codeEditorElement = ref<HTMLElement | null>(null);
const diffEditorElement = ref<HTMLElement | null>(null);
const codeEditorInstance =
    shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
const diffEditorInstance =
    shallowRef<monaco.editor.IStandaloneDiffEditor | null>(null);
const vimAdapter = shallowRef<VimAdapterInstance | null>(null);
let originalModel: monaco.editor.ITextModel | null = null;
let modifiedModel: monaco.editor.ITextModel | null = null;

const disposeVimMode = () => {
    vimAdapter.value?.dispose();
    vimAdapter.value = null;
};

const syncVimMode = () => {
    disposeVimMode();
    if (!vimModeEnabled.value) return;

    const activeEditor = showDiff.value
        ? (diffEditorInstance.value?.getModifiedEditor() ?? null)
        : codeEditorInstance.value;

    if (!activeEditor) return;
    vimAdapter.value = initVimMode(activeEditor, null);
};

// --- Diff settings ------------------------------------

const showDiff = ref(false);

const viewMenuDetails = ref<HTMLDetailsElement | null>(null);
function closeViewMenu() {
    const menu = viewMenuDetails.value;
    if (!menu?.open) return;
    menu.open = false;
    menu.querySelector("summary")?.focus();
}
const onMenuPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    const viewMenu = viewMenuDetails.value;
    if (viewMenu?.open && !viewMenu.contains(target)) {
        viewMenu.open = false;
    }
};

// Keep diff editor options in sync reactively
const diffOptions = computed(() => ({
    ...monacoOptions.value,
    renderSideBySide: false,
}));

// Both editors share the modified model, so toggling the diff never replaces
// its value or clears Monaco's undo history.
function mountCodeEditor() {
    const codeElement = codeEditorElement.value;
    if (!codeElement) throw new Error("Missing Monaco editor container");

    modifiedModel = monaco.editor.createModel(editorHtml.value, "html");
    codeEditorInstance.value = monaco.editor.create(codeElement, {
        ...monacoOptions.value,
        model: modifiedModel,
    });
    modifiedModel.onDidChangeContent(() => {
        const value = modifiedModel?.getValue();
        if (value !== undefined && value !== editorHtml.value) {
            editorHtml.value = value;
        }
    });
    syncVimMode();
}

function mountDiffEditor() {
    const diffElement = diffEditorElement.value;
    if (!diffElement || !modifiedModel) {
        throw new Error("Missing Monaco diff editor container");
    }

    originalModel = monaco.editor.createModel(props.baseline, "html");
    diffEditorInstance.value = monaco.editor.createDiffEditor(
        diffElement,
        diffOptions.value,
    );
    diffEditorInstance.value.setModel({
        original: originalModel,
        modified: modifiedModel,
    });
}

watch(editorHtml, (html) => {
    if (modifiedModel && modifiedModel.getValue() !== html) {
        modifiedModel.setValue(html);
    }
});
watch(
    () => props.baseline,
    (baseline) => {
        if (originalModel && originalModel.getValue() !== baseline) {
            originalModel.setValue(baseline);
        }
    },
);
watch(vimModeEnabled, syncVimMode);
watch(showDiff, async () => {
    await nextTick();
    if (showDiff.value && !diffEditorInstance.value) mountDiffEditor();
    const activeEditor = showDiff.value
        ? diffEditorInstance.value
        : codeEditorInstance.value;
    activeEditor?.layout();
    syncVimMode();
});
watch(
    monacoOptions,
    (opts) => {
        codeEditorInstance.value?.updateOptions(opts);
        diffEditorInstance.value?.updateOptions({
            ...opts,
            renderSideBySide: false,
        });
    },
    { deep: true },
);

onMounted(() => {
    document.addEventListener("pointerdown", onMenuPointerDown);
    mountCodeEditor();
});
onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onMenuPointerDown);
    disposeVimMode();
    codeEditorInstance.value?.dispose();
    diffEditorInstance.value?.dispose();
    modifiedModel?.dispose();
    originalModel?.dispose();
});
defineExpose({ closeMenu: closeViewMenu });
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
</style>

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
                <CodeEditor
                    v-if="!showDiff"
                    v-model:value="editorHtml"
                    language="html"
                    :theme="editorTheme"
                    :options="monacoOptions"
                    @editorDidMount="onEditorDidMount"
                    class="code-editor"
                />

                <DiffEditor
                    v-else
                    :value="diffHtml"
                    :original="baseline"
                    language="html"
                    :theme="editorTheme"
                    :options="diffOptions"
                    @change="onDiffChange"
                    @editorDidMount="onDiffDidMount"
                    class="code-editor"
                />
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
    onMounted,
    onBeforeUnmount,
} from "vue";
import * as monaco from "monaco-editor";
import { CodeEditor, DiffEditor } from "monaco-editor-vue3";
import { initVimMode, type VimAdapterInstance } from "monaco-vim";
import "./toolbar.css";
import TwoPaneLayout from "../utils/TwoPaneLayout.vue";

const editorHtml = defineModel<string>({ required: true });
defineProps<{
    baseline: string;
    publishing: boolean;
    shouldShakePublish: boolean;
}>();
const emit = defineEmits<{ publish: []; download: [] }>();
const diffHtml = ref(editorHtml.value);
watch(editorHtml, (html) => {
    // DiffEditor emits through editorHtml too. Do not feed that same change
    // back through its value prop: Monaco's setValue clears its undo history.
    if (
        showDiff.value &&
        diffEditorInstance.value?.getModifiedEditor().getValue() === html
    )
        return;
    diffHtml.value = html;
});

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

const codeEditorInstance =
    shallowRef<monaco.editor.IStandaloneCodeEditor | null>(null);
const vimAdapter = shallowRef<VimAdapterInstance | null>(null);

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

const onEditorDidMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    codeEditorInstance.value = editor;
    syncVimMode();
};

// --- Diff settings ------------------------------------

// Keep the editor and diff HTML in sync (v-model does not work)
const showDiff = ref(false);
watch(showDiff, (enabled) => {
    if (enabled) {
        codeEditorInstance.value = null;
        diffHtml.value = editorHtml.value;
    } else {
        diffEditorInstance.value = null;
    }
});
const onDiffChange = (value: string) => {
    editorHtml.value = value;
};

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
const diffEditorInstance =
    shallowRef<monaco.editor.IStandaloneDiffEditor | null>(null);
const onDiffDidMount = (editor: monaco.editor.IStandaloneDiffEditor) => {
    diffEditorInstance.value = editor;
    syncVimMode();
};
watch([vimModeEnabled, showDiff], syncVimMode);
watch(
    monacoOptions,
    (opts) => {
        if (!diffEditorInstance.value) return;
        const modified = diffEditorInstance.value.getModifiedEditor();
        const original = diffEditorInstance.value.getOriginalEditor();

        modified.updateOptions(opts);
        original.updateOptions(opts);
    },
    { deep: true },
);

onMounted(() => document.addEventListener("pointerdown", onMenuPointerDown));
onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onMenuPointerDown);
    disposeVimMode();
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

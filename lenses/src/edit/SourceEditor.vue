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
                <div ref="editorElement" class="code-editor"></div>
            </div>
        </template>

        <template #right-pane><slot name="preview" /></template>
    </TwoPaneLayout>
</template>

<script setup lang="ts">
import {
    ref,
    watch,
    onMounted,
    onBeforeUnmount,
} from "vue";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
    EditorView,
    highlightWhitespace,
    keymap,
    type ViewUpdate,
} from "@codemirror/view";
import { acceptCompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { unifiedMergeView } from "@codemirror/merge";
import { oneDark } from "@codemirror/theme-one-dark";
import { vim } from "@replit/codemirror-vim";
import "./toolbar.css";
import TwoPaneLayout from "../utils/TwoPaneLayout.vue";

const editorHtml = defineModel<string>({ required: true });
const props = defineProps<{
    baseline: string;
    publishing: boolean;
    shouldShakePublish: boolean;
}>();
const emit = defineEmits<{ publish: []; download: [] }>();

// --- Editor settings ------------------------------------
const darkMode = ref(true);
const wordWrap = ref(true);
const renderWhitespace = ref(false);
const vimModeEnabled = ref(false);

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

const editorElement = ref<HTMLElement | null>(null);
let editor: EditorView | null = null;

// Compartments let settings change without rebuilding the editor. The
// document, selection, and undo history therefore survive diff/settings
// toggles.
const themeConfig = new Compartment();
const wrappingConfig = new Compartment();
const whitespaceConfig = new Compartment();
const vimConfig = new Compartment();
const diffConfig = new Compartment();

function optional(enabled: boolean, extension: Extension): Extension {
    return enabled ? extension : [];
}

function currentDiffExtension(): Extension {
    return showDiff.value
        ? unifiedMergeView({
              original: props.baseline,
              // Reject restores this chunk to the published baseline.
              mergeControls: true,
              gutter: true,
              allowInlineDiffs: true,
          })
        : [];
}

function syncEditorModel(update: ViewUpdate) {
    if (!update.docChanged) return;
    const value = update.state.doc.toString();
    if (value !== editorHtml.value) editorHtml.value = value;
}

function reconfigure(compartment: Compartment, extension: Extension) {
    editor?.dispatch({ effects: compartment.reconfigure(extension) });
}

watch(editorHtml, (html) => {
    if (!editor || editor.state.doc.toString() === html) return;
    editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: html },
    });
});
watch(
    () => props.baseline,
    () => reconfigure(diffConfig, currentDiffExtension()),
);
watch(showDiff, () => reconfigure(diffConfig, currentDiffExtension()));
watch(darkMode, (enabled) =>
    reconfigure(themeConfig, optional(enabled, oneDark)),
);
watch(wordWrap, (enabled) =>
    reconfigure(wrappingConfig, optional(enabled, EditorView.lineWrapping)),
);
watch(renderWhitespace, (enabled) =>
    reconfigure(whitespaceConfig, optional(enabled, highlightWhitespace())),
);
watch(vimModeEnabled, (enabled) =>
    reconfigure(vimConfig, optional(enabled, vim())),
);

onMounted(() => {
    document.addEventListener("pointerdown", onMenuPointerDown);
    const parent = editorElement.value;
    if (!parent) throw new Error("Missing CodeMirror editor container");

    editor = new EditorView({
        parent,
        state: EditorState.create({
            doc: editorHtml.value,
            extensions: [
                basicSetup,
                html(),
                // Prefer accepting an open completion, then indent when no
                // completion is active. CodeMirror otherwise leaves Tab to
                // browser focus navigation for accessibility.
                keymap.of([
                    { key: "Tab", run: acceptCompletion },
                    indentWithTab,
                ]),
                EditorView.updateListener.of(syncEditorModel),
                themeConfig.of(oneDark),
                wrappingConfig.of(EditorView.lineWrapping),
                whitespaceConfig.of([]),
                vimConfig.of([]),
                diffConfig.of([]),
            ],
        }),
    });
});
onBeforeUnmount(() => {
    document.removeEventListener("pointerdown", onMenuPointerDown);
    editor?.destroy();
    editor = null;
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
    overflow: hidden;
}

.code-editor :deep(.cm-editor) {
    height: 100%;
}

.code-editor :deep(.cm-scroller) {
    overflow: auto;
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
        monospace;
}
</style>

import {
    computed,
    defineComponent,
    nextTick,
    ref,
    watch,
    onMounted,
    onBeforeUnmount,
} from "vue";
import { basicSetup } from "codemirror";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, highlightWhitespace, keymap, type ViewUpdate } from "@codemirror/view";
import { acceptCompletion } from "@codemirror/autocomplete";
import { indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import { unifiedMergeView } from "@codemirror/merge";
import { oneDark } from "@codemirror/theme-one-dark";
import { vim } from "@replit/codemirror-vim";
import TwoPaneLayout from "../../utils/TwoPaneLayout/main";

type Props = {
    modelValue: string;
    baseline: string;
    publishing: boolean;
    shouldShakePublish: boolean;
    guideUrl: string;
    mode: "create" | "edit";
    active: boolean;
    singlePane: boolean;
    showBack: boolean;
};
export type SourceEditorHandle = { closeMenu: () => void };
type Emit = {
    (event: "publish" | "download" | "choose-path"): void;
    (event: "update:modelValue", value: string): void;
};

function setupSourceEditor(
    props: Props,
    { emit, expose }: { emit: Emit; expose: (handle: SourceEditorHandle) => void },
) {
    const editorHtml = computed({
        get: () => props.modelValue,
        set: (value: string) => emit("update:modelValue", value),
    });

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

    function mountEditor() {
        if (editor) return;
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
                    // Returning from another path recreates CodeMirror with saved settings.
                    themeConfig.of(optional(darkMode.value, oneDark)),
                    wrappingConfig.of(optional(wordWrap.value, EditorView.lineWrapping)),
                    whitespaceConfig.of(optional(renderWhitespace.value, highlightWhitespace())),
                    vimConfig.of(optional(vimModeEnabled.value, vim())),
                    diffConfig.of(currentDiffExtension()),
                ],
            }),
        });
    }
    function destroyEditor() {
        editor?.destroy();
        editor = null;
    }
    onMounted(() => {
        document.addEventListener("pointerdown", onMenuPointerDown);
        if (props.active) mountEditor();
    });
    watch(() => props.active, async (active) => {
        if (active) {
            await nextTick();
            if (props.active) mountEditor();
        } else {
            closeViewMenu();
            destroyEditor();
        }
    }, { flush: "post" });
    onBeforeUnmount(() => {
        document.removeEventListener("pointerdown", onMenuPointerDown);
        destroyEditor();
    });
    expose({ closeMenu: closeViewMenu });
    return {
        darkMode,
        wordWrap,
        renderWhitespace,
        vimModeEnabled,
        showDiff,
        viewMenuDetails,
        editorElement,
        closeViewMenu,
        emit,
    };
}

export default defineComponent({
    template: "#source-editor-template",
    components: { TwoPaneLayout },
    props: {
        modelValue: { type: String, required: true },
        baseline: { type: String, required: true },
        publishing: { type: Boolean, required: true },
        shouldShakePublish: { type: Boolean, required: true },
        guideUrl: { type: String, required: true },
        mode: { type: String, required: true },
        active: { type: Boolean, required: true },
        singlePane: { type: Boolean, required: true },
        showBack: { type: Boolean, required: true },
    },
    emits: ["publish", "download", "choose-path", "update:modelValue"],
    setup: setupSourceEditor,
});

<template>
    <main>
        <TwoPaneLayout left-title="Editor" right-title="Preview">
            <template #left-controls>
                <nav>
                    <ul role="menubar">
                        <li
                            class="split-button-menu"
                            :class="{ 'publish-shake': shouldShakePublish }"
                        >
                            <button :disabled="publishing" @click="publish()">
                                Publish
                            </button>
                            <details
                                ref="publishMenuDetails"
                                :class="{ disabled: publishing }"
                            >
                                <summary :aria-disabled="publishing">▾</summary>
                                <ul role="menu">
                                    <li>
                                        <button
                                            :disabled="publishing"
                                            role="menuitem"
                                            @click="publish(true)"
                                        >
                                            Publish as…
                                        </button>
                                    </li>
                                </ul>
                            </details>
                        </li>

                        <li role="none">
                            <button type="button" @click="download()">
                                Download
                            </button>
                        </li>

                        <li role="none">
                            <details ref="viewMenuDetails">
                                <summary role="menuitem">▾ View</summary>

                                <ul role="menu">
                                    <li>
                                        <label class="menu-checkbox">
                                            <input
                                                type="checkbox"
                                                v-model="showDiff"
                                            />
                                            Show changes
                                        </label>
                                    </li>

                                    <li role="separator"></li>

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

            <template #right-controls>
                <nav>
                    <ul>
                        <li>
                            <button
                                class="refresh-button"
                                title="Refresh the preview"
                                @click="refreshPreview"
                            >
                                Refresh
                                <span
                                    v-if="debouncing"
                                    class="refresh-spinner"
                                    aria-hidden="true"
                                ></span>
                            </button>
                        </li>
                        <li>
                            <label class="top-level-checkbox">
                                <input type="checkbox" v-model="livePreview" />
                                Auto-refresh
                            </label>
                        </li>
                    </ul>
                </nav>
            </template>

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
                        :original="publishedHtml"
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
                    <sw-transclude
                        :id="previewTranscludeId"
                        name="Preview"
                        :hash="pageHash"
                        :key="refreshKey"
                        :srcdoc="previewHtml"
                    ></sw-transclude>
                </div>
            </template>
        </TwoPaneLayout>

        <div v-if="publishing" class="backdrop" @click.prevent="">
            <h1 class="dots">Publishing</h1>
        </div>
    </main>
</template>

<script setup lang="ts">
import {
    ref,
    shallowRef,
    watch,
    computed,
    onBeforeUnmount,
    onMounted,
} from "vue";
import * as monaco from "monaco-editor";
import { CodeEditor, DiffEditor } from "monaco-editor-vue3";
import TwoPaneLayout from "../utils/TwoPaneLayout.vue";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/wrapper-vue";
import { createPageVersion } from "../utils/page-versions";
import { initVimMode, type VimAdapterInstance } from "monaco-vim";
import { initLens } from "../../backend/lens-client";
import { composeRoute } from "../../backend/route";
import { randomBytes, bytesToHex } from "@noble/hashes/utils.js";

const previewTranscludeId = bytesToHex(randomBytes());

const template = (pageName: string) => `<!doctype html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />

  <!-- Connect the page to Social.Wiki -->
  <script src="${window.topOrigin}/init.js"><\/script>

  <!-- Better default styling -->
  <meta name="color-scheme" content="light dark" />
  <link
    rel="stylesheet"
    href="https://cdn.jsdelivr.net/npm/water.css@2/out/water.css"
  />

  <!-- Initialize Vue.js with Graffiti -->
  <script type="module">
    import { createApp } from "vue";
    import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";

    createApp({
      template: "#template",
      data: () => ({
        processingWave: false,
        // Add more app data here
      }),
    })
      .use(GraffitiPlugin, {
        graffiti: new window.graffiti(),
      })
      .mount("#app");
  <\/script>
</head>

<body>
  <div id="app"><h1>Loading…</h1></div>

  <template id="template">
    <h1>Your page here!</h1>

    <!-- "Discover" any waves from this page -->
    <graffiti-discover
      v-slot="{ objects: waves, isFirstPoll }"
      :channels="[ '${pageName}' ]"
      :schema="{ properties: { value: {
        required: ['activity'],
        properties: {
          activity: { const: 'Wave' }
        }
      }}}"
    >
      <button
        v-if="!$graffitiSession.value"
        @click="$graffiti.login()"
      >
        Log in to wave!
      </button>

      <template v-else>
        <button v-if="isFirstPoll || processingWave" disabled>
          👋 Loading…
        </button>

        <!-- If you haven't waved yet, show "Wave" button -->
        <button
          v-else-if="!waves.some(
            wave => wave.actor === $graffitiSession.value.actor
          )"
          @click="
            processingWave = true;
            $graffiti.post(
              {
                value: { activity: 'Wave' },
                channels: [ '${pageName}' ],
              },
              $graffitiSession.value
            ).finally(() => {
              processingWave = false;
            });
          "
        >
          👋 Wave!
        </button>

        <!-- If you have already waved, show "Unwave" button -->
        <button
          v-else
          @click="
            waves
              .filter(wave =>
                wave.actor === $graffitiSession.value.actor
              )
              .forEach(wave => {
                processingWave = true;
                $graffiti.delete(
                  wave,
                  $graffitiSession.value
                ).finally(() => {
                  processingWave = false;
                });
              });
          "
        >
          👋 Unwave
        </button>
      </template>

      <p>
        {{ new Set(waves.map(w => w.actor)).size }} people have waved from this page.
      </p>
    </graffiti-discover>
  </template>
</body>`;

const draftHtml = ref("");
const publishedHtml = ref<string | null>(null);

// Initialize the editor, diff and preview with the existing HTML
const editorHtml = ref("");
const previewHtml = ref("");
const diffHtml = ref("");
const hasUnsavedChanges = computed(
    () => editorHtml.value !== publishedHtml.value,
);
const hasShownPublishReminder = ref(false);
const shouldShakePublish = ref(false);
let publishShakeTimeout: number | null = null;
watch(
    draftHtml,
    (newHtml) => {
        editorHtml.value = newHtml;
        previewHtml.value = newHtml;
        diffHtml.value = newHtml;
    },
    { immediate: true },
);
watch(hasUnsavedChanges, (isDirty, wasDirty) => {
    if (!isDirty || wasDirty || hasShownPublishReminder.value) return;
    hasShownPublishReminder.value = true;
    shouldShakePublish.value = true;
    if (publishShakeTimeout !== null) clearTimeout(publishShakeTimeout);
    publishShakeTimeout = window.setTimeout(() => {
        shouldShakePublish.value = false;
        publishShakeTimeout = null;
    }, 320);
});

const navigate = window.navigate;

const pageName = ref("");
const pageHash = ref("");
const session = useGraffitiSession();
const graffiti = useGraffiti();
initLens(async (pageAddress, lensParams) => {
    const url = new URL(pageAddress, "https://example.com");
    pageName.value = url.pathname.slice(1);
    pageHash.value = url.hash;

    const searchDraft = lensParams.get("draft");
    if (searchDraft !== null) {
        draftHtml.value = searchDraft;
    } else if (!draftHtml.value.length) {
        // If there's no draft HTML, initialize it with the template
        draftHtml.value = template(pageName.value);
    }

    if (publishedHtml.value === null) {
        publishedHtml.value = draftHtml.value;
        hasShownPublishReminder.value = false;
        shouldShakePublish.value = false;
        if (publishShakeTimeout !== null) {
            clearTimeout(publishShakeTimeout);
            publishShakeTimeout = null;
        }
    }
});

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

const monacoOptions = computed(() => ({
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

const publishMenuDetails = ref<HTMLDetailsElement | null>(null);
const viewMenuDetails = ref<HTMLDetailsElement | null>(null);
const onMenuPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    const publishMenu = publishMenuDetails.value;
    if (publishMenu?.open && !publishMenu.contains(target)) {
        publishMenu.open = false;
    }

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

// Preview option
const livePreview = ref(true);

// Auto-refresh the preview
const DEBOUNCE_DELAY = 500;
let timeout: number | null = null;
onBeforeUnmount(() => {
    if (timeout !== null) clearTimeout(timeout);
    if (publishShakeTimeout !== null) clearTimeout(publishShakeTimeout);
});
const debouncing = ref(false);
const schedulePreviewUpdate = (newHtml: string) => {
    debouncing.value = true;
    if (timeout !== null) clearTimeout(timeout);
    timeout = window.setTimeout(() => {
        previewHtml.value = newHtml;

        // Set the draft HTML
        navigate(
            `#${composeRoute({
                lens: "e",
                lensParams: new URLSearchParams({ draft: newHtml }),
                pageAddress: `${pageName.value}${pageHash.value}`,
            })}`,
        );

        debouncing.value = false;
        timeout = null;
    }, DEBOUNCE_DELAY);
};
watch(editorHtml, (newHtml) => {
    if (!livePreview.value) return;
    if (newHtml === previewHtml.value) return;
    schedulePreviewUpdate(newHtml);
});

// When auto-refresh is turned on, refresh once immediately
watch(livePreview, (enabled, oldVal) => {
    if (enabled && !oldVal) refreshPreview();
});

// --- Publishing ----------------------------------------------
const bypassBeforeUnload = ref(false);
const beforeUnload = (event: BeforeUnloadEvent) => {
    if (bypassBeforeUnload.value || !hasUnsavedChanges.value) return;

    event.preventDefault();
    event.returnValue = "";
};
onMounted(() => {
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("pointerdown", onMenuPointerDown);
});
onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", beforeUnload);
    document.removeEventListener("pointerdown", onMenuPointerDown);
    disposeVimMode();
    clearLoginBypassListener();
});

const publishing = ref(false);
let loginBypassListener: ((event: Event) => void) | null = null;
function clearLoginBypassListener() {
    if (!loginBypassListener) return;
    graffiti.sessionEvents.removeEventListener("login", loginBypassListener);
    loginBypassListener = null;
}
function setupLoginBypassListener() {
    clearLoginBypassListener();
    loginBypassListener = () => {
        bypassBeforeUnload.value = false;
        clearLoginBypassListener();
    };
    graffiti.sessionEvents.addEventListener("login", loginBypassListener);
}
async function publish(as?: boolean) {
    if (publishing.value) return;
    publishing.value = true;
    try {
        if (!session.value) {
            bypassBeforeUnload.value = true;
            setupLoginBypassListener();
            try {
                await graffiti.login();
            } catch (error) {
                clearLoginBypassListener();
                bypassBeforeUnload.value = false;
                throw error;
            }
            return;
        }

        const publishName = as
            ? prompt(
                  "What page name do you want to publish to?",
                  pageName.value,
              )
            : pageName.value;
        if (publishName === null) return;
        const summary = prompt("Edit summary (Briefly describe your changes)");
        if (summary === null) return;
        const nextPublishedHtml = editorHtml.value;
        await createPageVersion(
            graffiti,
            publishName,
            nextPublishedHtml,
            [],
            summary,
            session.value,
        );

        draftHtml.value = nextPublishedHtml;
        publishedHtml.value = nextPublishedHtml;
        hasShownPublishReminder.value = false;
        shouldShakePublish.value = false;
        if (publishShakeTimeout !== null) {
            clearTimeout(publishShakeTimeout);
            publishShakeTimeout = null;
        }
        navigate(`#/v/${publishName}${pageHash.value}`);
    } finally {
        publishing.value = false;
    }
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

.backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: #000000cc;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* Editor menubar + dropdowns */
nav > ul[role="menubar"] > li {
    position: relative;
}

:is(
    nav summary[role="menuitem"],
    nav > ul > li:not(.split-button-menu) > button,
    nav > ul > li > :where(label.top-level-checkbox)
) {
    list-style: none; /* remove default marker in some browsers */
    cursor: pointer;
    color: var(--link-color);
    background: var(--background-color-interactive);
    border: 1px solid var(--border-color);
    user-select: none;
    padding: 0.25rem 0.5rem;
    border-radius: 0.5rem;

    &:hover {
        color: var(--link-color-hover);
        background: var(--background-color-interactive-hover);
        border-color: var(--border-color-hover);
        text-decoration: none;
    }
}

/* dropdown menu */
nav ul[role="menu"] {
    position: absolute;
    top: calc(100% + 0.25rem);
    left: 0;

    padding: 0.25rem;
    list-style: none;

    background: var(--background-color);
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    box-shadow: 0 10px 30px #000000aa;
    z-index: 50;

    width: max-content;
}

nav ul[role="menu"] > li > button[role="menuitem"] {
    color: inherit;
    padding: 0.25rem 0.25rem;
    border-radius: 0.5rem;
    cursor: pointer;
}

nav ul[role="menu"] > li > button[role="menuitem"]:hover {
    background: var(--background-color-interactive);
    text-decoration: none;
}

nav ul[role="menu"] > li > button[role="menuitem"]:focus-visible {
    outline: 2px solid var(--border-color-hover);
}

nav ul[role="menu"] > li > label.menu-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.4rem;
    border-radius: 0.5rem;
    cursor: pointer;
    user-select: none;
}

nav ul[role="menu"] > li > label.menu-checkbox:hover {
    background: var(--background-color-interactive);
}

nav .top-level-checkbox {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
}

nav .refresh-button {
    position: relative;
}

nav .refresh-spinner {
    position: absolute;
    top: -0.1rem;
    right: -0.1rem;
    width: 0.7rem;
    height: 0.7rem;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: refresh-spin 1s linear infinite;
    pointer-events: none;
}

/* separators */
nav ul[role="menu"] > li[role="separator"] {
    height: 1px;
    background: var(--border-color);
    margin: 0.25rem 0.25rem;
}

.split-button-menu.publish-shake {
    animation: publish-shake 0.3s ease-in-out;
}

@keyframes publish-shake {
    0% {
        transform: translateX(0);
    }
    25% {
        transform: translateX(-4px);
    }
    50% {
        transform: translateX(4px);
    }
    75% {
        transform: translateX(-2px);
    }
    100% {
        transform: translateX(0);
    }
}

@keyframes refresh-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>

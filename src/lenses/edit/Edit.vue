<template>
    <main>
        <TwoPaneLayout left-title="Editor" right-title="Preview">
            <template #left-controls>
                <nav>
                    <ul role="menubar">
                        <li class="publish-menu">
                            <button
                                :disabled="draftHtml === editorHtml"
                                @click="publish()"
                            >
                                Publish
                            </button>
                            <details
                                :class="{ disabled: draftHtml === editorHtml }"
                            >
                                <summary
                                    :aria-disabled="draftHtml === editorHtml"
                                >
                                    ▾
                                </summary>
                                <ul role="menu">
                                    <li>
                                        <button
                                            :disabled="draftHtml === editorHtml"
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
                            <details>
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
                                title="Refresh the preview"
                                @click="refreshPreview"
                            >
                                {{ debouncing ? "Refreshing…" : "Refresh" }}
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
                    <sw-transclude
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
import { ref, watch, computed, onBeforeUnmount, onMounted } from "vue";
import * as monaco from "monaco-editor";
import { CodeEditor, DiffEditor } from "monaco-editor-vue3";
import TwoPaneLayout from "../TwoPaneLayout.vue";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/wrapper-vue";
import { createPageVersion } from "../../backend/page-versions";
import { initVimMode } from "monaco-vim";
import { initLens } from "../../backend/lens-client";

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
            ).then(() => {
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
                ).then(() => {
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

// Initialize the editor, diff and preview with the existing HTML
const editorHtml = ref("");
const previewHtml = ref("");
const diffHtml = ref("");
watch(
    draftHtml,
    (newHtml) => {
        editorHtml.value = newHtml;
        previewHtml.value = newHtml;
        diffHtml.value = newHtml;
    },
    { immediate: true },
);

const navigate = window.navigate;

const address = ref("");
const pageName = ref("");
const pageHash = ref("");
const session = useGraffitiSession();
initLens(async (a: string) => {
    address.value = a;
    const url = new URL(a, "https://example.com");
    pageName.value = url.pathname.slice(1);
    pageHash.value = url.hash;

    const login = url.searchParams.get("login");
    if (login !== null && !session.value) {
        graffiti.login();
        return;
    }

    const searchDraft = url.searchParams.get("draft");
    if (searchDraft) {
        draftHtml.value = searchDraft;
    } else if (!draftHtml.value.length) {
        // If there's no draft HTML, initialize it with the template
        draftHtml.value = template(pageName.value);
    }

    if (searchDraft !== null || login !== null) {
        // Strip the draft and login state from the URL
        // and navigate to the clean URL
        url.searchParams.delete("draft");
        url.searchParams.delete("login");
        const cleanAddress = pageName.value + url.search + url.hash;
        navigate(`#/e/${cleanAddress}`);
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

// Preview option
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
    if (editorHtml.value === draftHtml.value) return;

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
async function publish(as?: boolean) {
    if (!session.value) {
        // Save the current draft in the URL
        // along with "login"
        navigate(
            `#/e/${pageName.value}?draft=${encodeURIComponent(editorHtml.value)}&login=true`,
        );
        return;
    }

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
        session.value,
    );

    draftHtml.value = publishedHtml;
    navigate(`#/v/${publishName}`);
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
    nav > ul > li > button,
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

/* separators */
nav ul[role="menu"] > li[role="separator"] {
    height: 1px;
    background: var(--border-color);
    margin: 0.25rem 0.25rem;
}

nav .publish-menu {
    display: inline-flex;
    align-items: stretch;
    gap: 0;

    > button:disabled,
    summary[aria-disabled="true"] {
        background: var(--background-color-interactive);
        color: var(--text-color);
        cursor: not-allowed;
    }

    > button,
    summary {
        border: 1px solid var(--border-color);
        background: var(--accent-button-background);
        color: var(--accent-button-text);
        display: inline-flex;
        align-items: center;
    }

    > button {
        border-radius: 0.5rem 0 0 0.5rem;
        height: 100%;
    }

    summary {
        border-radius: 0 0.5rem 0.5rem 0;
        height: 100%;
    }

    > button:not(:disabled):hover,
    summary:not([aria-disabled="true"]):hover {
        background: var(--accent-button-background-hover);
        color: var(--accent-button-text);
        cursor: pointer;
        border-color: var(--border-color-hover);
        text-decoration: none;
    }

    summary {
        border-left: none;
        width: 1.5rem;
        text-align: center;
        justify-content: center;
        user-select: none;
    }

    summary::marker {
        content: "";
    }
}

nav .publish-menu > details.disabled > summary {
    pointer-events: none;
}

nav .publish-menu > button:disabled:hover {
    background: var(--background-color-interactive);
    border-color: var(--border-color);
    color: var(--text-color);
    text-decoration: none;
    cursor: not-allowed;
}

.publish-menu:has(button:not(:disabled)) {
    animation: publish-shake 0.3s ease-in-out;
}

.publish-menu:has(button:disabled) {
    animation: none;
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
</style>

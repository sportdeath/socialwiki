<template>
    <main class="meta-lens-editor">
        <TwoPaneLayout
            :left-title="editorTitle"
            right-title="Preview"
        >
            <template #left-controls>
                <button type="button" @click="resetLens" :disabled="busy">
                    Reset
                </button>
            </template>

            <template #left-pane>
                <section class="editor-pane">
                    <p v-if="errorMessage.length" class="error-message">
                        {{ errorMessage }}
                    </p>
                    <CodeEditor
                        v-model:value="source"
                        language="html"
                        theme="vs"
                        :options="{ automaticLayout: true }"
                        class="code-editor"
                    />
                </section>
            </template>

            <template #right-pane>
                <section class="preview-pane">
                    <sw-transclude
                        id="meta-lens-preview"
                        :name="`Lens ${lens.toUpperCase()} Preview`"
                        ignore-lens-output
                        :query="query"
                        :srcdoc="previewSource"
                    ></sw-transclude>
                </section>
            </template>
        </TwoPaneLayout>
    </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { CodeEditor } from "monaco-editor-vue3";
import TwoPaneLayout from "../utils/TwoPaneLayout.vue";
import {
    getLensSource,
    resetLensSource,
    setLensSource,
    type Lens,
} from "./lens-resolver";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/wrapper-vue";

const props = defineProps<{
    lens: Lens;
    query: string;
}>();

const lensLabel = computed(() =>
    props.lens === "v" ? "View" : props.lens === "e" ? "Edit" : "History",
);
const editorTitle = computed(() => `"${lensLabel.value}" Source Code`);

const source = ref("");
const previewSource = ref("");
const errorMessage = ref("");
const busy = ref(false);
const graffiti = useGraffiti();
const session = useGraffitiSession();
let saveTimer: number | undefined;
let savedSource = "";
let loadVersion = 0;
let saveVersion = 0;

function requireSession() {
    if (!session.value) throw new Error("Log in to modify a lens");
    return session.value;
}

function clearSaveTimer() {
    saveVersion++;
    if (saveTimer !== undefined) clearTimeout(saveTimer);
    saveTimer = undefined;
}

async function loadLensSource() {
    const thisLoad = ++loadVersion;
    busy.value = true;
    errorMessage.value = "";
    clearSaveTimer();

    try {
        const rawSource = await getLensSource(
            graffiti,
            props.lens,
            requireSession(),
        );
        if (thisLoad !== loadVersion) return;

        savedSource = rawSource;
        source.value = rawSource;
        previewSource.value = rawSource;
    } catch (error) {
        if (thisLoad !== loadVersion) return;
        errorMessage.value =
            error instanceof Error ? error.message : String(error);
    } finally {
        if (thisLoad === loadVersion) {
            busy.value = false;
        }
    }
}

function schedulePersist(nextSource: string) {
    clearSaveTimer();
    const thisSave = saveVersion;
    const lens = props.lens;
    const savingSession = requireSession();
    saveTimer = window.setTimeout(async () => {
        if (thisSave !== saveVersion) return;
        saveTimer = undefined;
        try {
            await setLensSource(
                graffiti,
                lens,
                nextSource,
                savingSession,
            );
            if (thisSave !== saveVersion) return;
            savedSource = nextSource;
            errorMessage.value = "";
        } catch (error) {
            if (thisSave !== saveVersion) return;
            errorMessage.value =
                error instanceof Error ? error.message : String(error);
        }
    }, 180);
}

async function resetLens() {
    busy.value = true;
    errorMessage.value = "";
    clearSaveTimer();
    try {
        await resetLensSource(
            graffiti,
            props.lens,
            requireSession(),
        );
        await loadLensSource();
    } catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : String(error);
    } finally {
        busy.value = false;
    }
}

watch(
    [() => props.lens, session],
    () => {
        if (session.value === undefined) return;
        void loadLensSource();
    },
    { immediate: true },
);

watch(source, (nextSource) => {
    previewSource.value = nextSource;
    if (nextSource === savedSource) return;
    schedulePersist(nextSource);
});

onBeforeUnmount(() => {
    loadVersion++;
    clearSaveTimer();
});
</script>

<style scoped>
.meta-lens-editor {
    height: 100%;
    display: flex;
    min-height: 0;
}

.editor-pane,
.preview-pane {
    width: 100%;
    display: flex;
    flex-direction: column;
    min-height: 0;
}

.preview-pane sw-transclude {
    width: 100%;
    flex: 1;
    min-height: 0;
}

.error-message {
    margin: 0;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--border-color);
    color: #c11;
    font-size: 0.9rem;
}

.code-editor {
    width: 100%;
    flex: 1;
    min-height: 0;
}
</style>

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
    embedLensSourceOrigin,
    type Lens,
    type LensSourceApi,
} from "../../backend/lens-sources";

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
let saveTimer: number | undefined;
let isHydrating = false;
let loadVersion = 0;

function getLensApi(): LensSourceApi {
    if (!window.socialWikiLenses) {
        throw new Error("Lens API is unavailable");
    }
    return window.socialWikiLenses;
}

function clearSaveTimer() {
    if (saveTimer === undefined) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
}

async function loadLensSource() {
    const thisLoad = ++loadVersion;
    busy.value = true;
    errorMessage.value = "";
    clearSaveTimer();

    try {
        const rawSource = await getLensApi().get(props.lens);
        if (thisLoad !== loadVersion) return;

        isHydrating = true;
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
        isHydrating = false;
    }
}

function schedulePersist(nextSource: string) {
    clearSaveTimer();
    saveTimer = window.setTimeout(async () => {
        try {
            await getLensApi().set(props.lens, nextSource);
            errorMessage.value = "";
        } catch (error) {
            errorMessage.value =
                error instanceof Error ? error.message : String(error);
        } finally {
            saveTimer = undefined;
        }
    }, 180);
}

async function resetLens() {
    busy.value = true;
    errorMessage.value = "";
    clearSaveTimer();
    try {
        await getLensApi().reset(props.lens);
        await loadLensSource();
    } catch (error) {
        errorMessage.value =
            error instanceof Error ? error.message : String(error);
    } finally {
        busy.value = false;
    }
}

watch(
    () => props.lens,
    () => {
        void loadLensSource();
    },
    { immediate: true },
);

watch(source, (nextSource) => {
    previewSource.value = embedLensSourceOrigin(nextSource, window.origin);
    if (isHydrating) return;
    schedulePersist(nextSource);
});

onBeforeUnmount(() => {
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

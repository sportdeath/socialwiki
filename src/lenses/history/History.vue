<template>
    <TwoPaneLayout leftTitle="History" rightTitle="Preview">
        <template #left-pane>
            <ol class="history-list">
                <li v-for="(version, index) in pageVersions" :key="version.url">
                    <article
                        :id="version.url"
                        :class="{ selected: isSelected(version) }"
                        role="button"
                        tabindex="0"
                        @click="selectPageVersion(version)"
                        @keydown.enter.self.prevent="selectPageVersion(version)"
                        @keydown.space.self.prevent="selectPageVersion(version)"
                    >
                        <header>
                            <h3>{{ formatSummary(version.value.summary) }}</h3>
                        </header>

                        <p class="history-meta">
                            <strong class="history-actor">
                                <GraffitiActorToHandle :actor="version.actor" />
                            </strong>
                            <time
                                :datetime="
                                    new Date(
                                        version.value.published,
                                    ).toISOString()
                                "
                            >
                                {{
                                    new Date(
                                        version.value.published,
                                    ).toLocaleString()
                                }}
                            </time>
                        </p>

                        <footer
                            v-if="$graffitiSession.value && isSelected(version)"
                        >
                            <ul>
                                <li
                                    v-if="$graffitiSession.value && index !== 0"
                                >
                                    <button
                                        @click.stop="
                                            restorePageVersion(
                                                version,
                                                $graffitiSession.value,
                                            )
                                        "
                                    >
                                        Restore
                                    </button>
                                </li>
                                <li
                                    v-if="
                                        $graffitiSession.value?.actor ===
                                        version.actor
                                    "
                                >
                                    <button
                                        @click.stop="
                                            deletePageVersion(
                                                graffiti,
                                                version,
                                                $graffitiSession.value,
                                            )
                                        "
                                    >
                                        Delete
                                    </button>
                                </li>
                            </ul>
                        </footer>
                    </article>
                </li>
            </ol>
        </template>
        <template #right-pane>
            <sw-transclude
                ref="transclude"
                :hash="pageHash"
                :src="
                    selectedPageVersion
                        ? `#/version/${selectedPageVersion.value.result.media}`
                        : ''
                "
            ></sw-transclude>
        </template>
    </TwoPaneLayout>
</template>

<script lang="ts" setup>
import TwoPaneLayout from "../TwoPaneLayout.vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import {
    createPageVersion,
    deletePageVersion,
    pageVersionSchema,
    type PageVersionObject,
} from "../../backend/page-versions";
import {
    useGraffiti,
    GraffitiActorToHandle,
    useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { computed, ref, watch } from "vue";
import { useTemplateRef } from "vue";
import { initLens } from "../../backend/lens-client";

const pageName = ref("");
const pageHash = ref("");

initLens(async (pageAddress, _lensParams) => {
    const url = new URL(pageAddress, "https://example.com");
    pageName.value = url.pathname.slice(1);
    pageHash.value = url.hash;
});

const transclude = useTemplateRef<HTMLElement>("transclude");
defineExpose({ transclude });

const { objects: pageVersionsRaw, isFirstPoll } = useGraffitiDiscover(
    () => [pageName.value],
    () => pageVersionSchema(pageName.value),
);
const pageVersions = computed(() =>
    // TODO: make a sort function that does the topological sort
    // Also add filters...
    pageVersionsRaw.value.toSorted(
        (a, b) => b.value.published - a.value.published,
    ),
);

const graffiti = useGraffiti();

async function restorePageVersion(
    version: PageVersionObject,
    session: GraffitiSession,
) {
    const html = transclude.value?.getAttribute("srcdoc");
    if (!html) {
        console.error("no HTML to restore");
        return;
    }
    selectedPageVersion.value = await createPageVersion(
        graffiti,
        version.value.object,
        html,
        pageVersions.value.map<string>((v) => v.url),
        `Restore: ${version.value.summary}`,
        session,
    );
}

const selectedPageVersion = ref<PageVersionObject | null | undefined>(
    undefined,
);

const selectPageVersion = (version: PageVersionObject) => {
    selectedPageVersion.value = version;
};

const isSelected = (version: PageVersionObject) =>
    selectedPageVersion.value?.url === version.url;

const formatSummary = (summary?: string) =>
    summary?.trim() || "No summary provided";

watch(pageVersions, async (versions) => {
    selectedPageVersion.value = versions.at(0) || null;
});
</script>

<style scoped>
.history-list {
    width: 100%;
    list-style: none;
    padding: 0.75rem;
    margin: 0;
    display: grid;
    gap: 0.75rem;
}

.history-list > li > article {
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 0.75rem;
    display: grid;
    gap: 0.45rem;
    cursor: pointer;
    transition:
        background-color 0.15s ease,
        border-color 0.15s ease;
}

.history-list > li > article:hover {
    background: var(--background-color-interactive);
    border-color: var(--border-color-hover);
}

.history-list > li > article.selected {
    background: var(--background-color-interactive);
    border-color: var(--border-color-hover);
    box-shadow: 0 0 0 1px var(--border-color-hover);
}

.history-list > li > article:focus-visible {
    outline: 2px solid var(--border-color-hover);
    outline-offset: 1px;
}

.history-list h3 {
    margin: 0;
    font-size: 1.1rem;
    line-height: 1.35;
    color: var(--link-color);
    overflow-wrap: anywhere;
    word-break: break-word;
}

.history-meta {
    display: grid;
    gap: 0.1rem;
}

.history-meta .history-actor {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text-color);
}

.history-meta time {
    color: var(--secondary-color);
    font-size: 0.85rem;
}

.history-list footer > ul {
    list-style: none;
    display: flex;
    gap: 0.85rem;
    margin: 0;
    padding: 0.15rem 0 0;
}
</style>

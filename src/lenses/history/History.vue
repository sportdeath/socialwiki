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

                        <div class="history-meta">
                            <p class="history-actor-row">
                                <strong class="history-actor">
                                    <GraffitiActorToHandle
                                        :actor="version.actor"
                                    />
                                </strong>
                                <span
                                    class="history-trust-inline"
                                    v-if="isSelected(version)"
                                >
                                    <template
                                        v-if="
                                            getActorTrustStatus(
                                                version.actor,
                                            ) === 'trusted'
                                        "
                                    >
                                        <span>(Trusted editor.</span>
                                        <button
                                            class="secondary"
                                            type="button"
                                            v-if="
                                                $graffitiSession.value &&
                                                !isUpdatingTrust(version.actor)
                                            "
                                            @click.stop.prevent="
                                                toggleActorTrust(
                                                    version.actor,
                                                    $graffitiSession.value,
                                                )
                                            "
                                        >
                                            Untrust?
                                        </button>
                                        <button
                                            class="secondary"
                                            disabled
                                            type="button"
                                            v-else
                                        >
                                            Updating...
                                        </button>
                                        <span>)</span>
                                    </template>
                                    <template
                                        v-else-if="
                                            getActorTrustStatus(
                                                version.actor,
                                            ) === 'untrusted'
                                        "
                                    >
                                        <span>(Untrusted editor.</span>
                                        <button
                                            type="button"
                                            v-if="
                                                $graffitiSession.value &&
                                                !isUpdatingTrust(version.actor)
                                            "
                                            @click.stop.prevent="
                                                toggleActorTrust(
                                                    version.actor,
                                                    $graffitiSession.value,
                                                )
                                            "
                                        >
                                            Trust?
                                        </button>
                                        <button
                                            class="secondary"
                                            disabled
                                            type="button"
                                            v-else
                                        >
                                            Updating...
                                        </button>
                                        <span>)</span>
                                    </template>
                                    <span v-else>(Loading...)</span>
                                </span>
                            </p>
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
                        </div>

                        <footer
                            v-if="$graffitiSession.value && isSelected(version)"
                        >
                            <ul>
                                <li
                                    v-if="$graffitiSession.value && index !== 0"
                                >
                                    <button
                                        :disabled="hasPendingMutation"
                                        @click.stop="
                                            restorePageVersion(
                                                version,
                                                $graffitiSession.value,
                                            )
                                        "
                                    >
                                        {{
                                            isRestoringVersion(version)
                                                ? "Restoring..."
                                                : "Restore"
                                        }}
                                    </button>
                                </li>
                                <li>
                                    <button @click.stop="openEditLens">
                                        Edit
                                    </button>
                                </li>
                                <li>
                                    <button @click.stop="openVersionLink">
                                        Link
                                    </button>
                                </li>
                                <li
                                    v-if="
                                        $graffitiSession.value?.actor ===
                                        version.actor
                                    "
                                >
                                    <button
                                        class="warning"
                                        :disabled="hasPendingMutation"
                                        @click.stop="
                                            deleteSelectedPageVersion(
                                                version,
                                                $graffitiSession.value,
                                            )
                                        "
                                    >
                                        {{
                                            isDeletingVersion(version)
                                                ? "Deleting..."
                                                : "Delete"
                                        }}
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
                id="preview"
                name="Preview"
                ref="transclude"
                :src="previewAddress"
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
    sortPageVersions,
} from "../page-versions";
import {
    useGraffiti,
    GraffitiActorToHandle,
    useGraffitiDiscover,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useTemplateRef } from "vue";
import { initLens, outputLensStatus } from "../../backend/lens-client";
import { composeRoute } from "../../backend/route";
import { annotationSchema } from "../utils/schemas";
import { computeTrustAnnotationsByActor, trustActor } from "../utils/trust";
import { defaultTrustedEditors } from "../../default-trusted-editors";

const pageName = ref("");
const pageHash = ref("");
const selectedPageVersion = ref<PageVersionObject | null | undefined>(
    undefined,
);

initLens(async (pageAddress, _lensParams) => {
    const url = new URL(pageAddress, "https://example.com");
    const nextPageName = url.pathname.slice(1);
    const nextPageHash = url.hash;
    const didChangePage = pageName.value !== nextPageName;

    pageName.value = nextPageName;
    pageHash.value = nextPageHash;

    if (didChangePage) {
        // Avoid rendering stale preview routes while the new page versions load.
        selectedPageVersion.value = undefined;
    }
});

const transclude = useTemplateRef<HTMLElement>("transclude");
defineExpose({ transclude });
let previewObserver: MutationObserver | undefined;

const outputPreviewIfReady = () => {
    const preview = transclude.value;
    if (!preview) return;

    const status = preview.getAttribute("status");
    const html = preview.getAttribute("srcdoc");
    if (status === "ok" && html !== null) {
        outputLensStatus("ok", html);
    }
};

onMounted(() => {
    if (!transclude.value) return;
    previewObserver = new MutationObserver(outputPreviewIfReady);
    previewObserver.observe(transclude.value, {
        attributes: true,
        attributeFilter: ["srcdoc"],
    });
    outputPreviewIfReady();
});

onBeforeUnmount(() => {
    previewObserver?.disconnect();
});

const { objects: pageVersionsRaw, isFirstPoll } = useGraffitiDiscover(
    () => [pageName.value],
    () => pageVersionSchema(pageName.value),
);
const pageVersions = computed(() => sortPageVersions(pageVersionsRaw.value));

const graffiti = useGraffiti();
const navigate = window.navigate;
const restoringVersionUrl = ref<string | null>(null);
const deletingVersionUrl = ref<string | null>(null);
const hasPendingMutation = computed(
    () =>
        restoringVersionUrl.value !== null || deletingVersionUrl.value !== null,
);

async function restorePageVersion(
    version: PageVersionObject,
    session: GraffitiSession,
) {
    if (hasPendingMutation.value) return;
    const html = transclude.value?.getAttribute("srcdoc");
    if (!html) {
        console.error("no HTML to restore");
        return;
    }
    restoringVersionUrl.value = version.url;
    try {
        selectedPageVersion.value = await createPageVersion(
            graffiti,
            version.value.object,
            html,
            pageVersions.value.map<string>((v) => v.url),
            `Restore: ${version.value.summary}`,
            session,
        );
    } finally {
        if (restoringVersionUrl.value === version.url) {
            restoringVersionUrl.value = null;
        }
    }
}

async function deleteSelectedPageVersion(
    version: PageVersionObject,
    session: GraffitiSession,
) {
    if (hasPendingMutation.value) return;
    deletingVersionUrl.value = version.url;
    try {
        await deletePageVersion(graffiti, version, session);
    } finally {
        if (deletingVersionUrl.value === version.url) {
            deletingVersionUrl.value = null;
        }
    }
}

function openEditLens() {
    const draft = transclude.value?.getAttribute("srcdoc") ?? "";
    navigate(
        `#${composeRoute({
            lens: "e",
            lensParams: new URLSearchParams({ draft }),
            pageAddress: `${pageName.value}${pageHash.value}`,
        })}`,
    );
}

function openVersionLink() {
    navigate(previewAddress.value);
}

const effectiveSelectedPageVersion = computed(() => {
    const selected = selectedPageVersion.value;
    if (
        selected &&
        pageVersions.value.some((version) => version.url === selected.url)
    ) {
        return selected;
    }

    return pageVersions.value.at(0) || null;
});

const previewAddress = computed(() => {
    const lensParams = new URLSearchParams();
    if (effectiveSelectedPageVersion.value) {
        lensParams.set(
            "version",
            effectiveSelectedPageVersion.value.value.result.media,
        );
    }

    return `#${composeRoute({
        lens: "v",
        lensParams,
        pageAddress: `${pageName.value}${pageHash.value}`,
    })}`;
});

const selectPageVersion = (version: PageVersionObject) => {
    selectedPageVersion.value = version;
};

const isSelected = (version: PageVersionObject) =>
    effectiveSelectedPageVersion.value?.url === version.url;
const isRestoringVersion = (version: PageVersionObject) =>
    restoringVersionUrl.value === version.url;
const isDeletingVersion = (version: PageVersionObject) =>
    deletingVersionUrl.value === version.url;

const formatSummary = (summary?: string) =>
    summary?.trim() || "No summary provided";

watch(pageVersions, (versions) => {
    if (!versions.length) {
        selectedPageVersion.value = undefined;
        return;
    }

    const selectedUrl = selectedPageVersion.value?.url;
    if (
        selectedUrl &&
        !versions.some((version) => version.url === selectedUrl)
    ) {
        selectedPageVersion.value = undefined;
    }
});

watch([pageVersions, isFirstPoll], ([versions, firstPoll]) => {
    if (firstPoll) return;
    if (!versions.length) {
        outputLensStatus("not-found");
    }
});

const session = useGraffitiSession();
const { objects: trustAnnotations, isFirstPoll: isTrustAnnotationLoading } =
    useGraffitiDiscover(
        () => (session.value ? [session.value.actor] : []),
        annotationSchema(["Trust", "Untrust"], { actor: session.value?.actor }),
    );
const trustAnnotationsByActor = computed(() => {
    if (isTrustAnnotationLoading.value) return undefined;
    return computeTrustAnnotationsByActor(
        trustAnnotations.value,
        defaultTrustedEditors,
    );
});

const getActorTrustStatus = (actor: string) => {
    const byActor = trustAnnotationsByActor.value;
    if (!byActor) return "loading";
    const trustValue = byActor.get(actor);
    return trustValue === true || trustValue?.value.activity === "Trust"
        ? "trusted"
        : "untrusted";
};

const trustMutationActor = ref<string | null>(null);
const isUpdatingTrust = (actor: string) => trustMutationActor.value === actor;

async function toggleActorTrust(actor: string, session: GraffitiSession) {
    trustMutationActor.value = actor;
    try {
        const trustValue = trustAnnotationsByActor.value?.get(actor);

        if (typeof trustValue === "object") {
            await graffiti.delete(trustValue, session);
        } else {
            await trustActor(graffiti, actor, session, {
                untrust: trustValue === true,
            });
        }
    } catch (error) {
        alert(`Error updating editor trust: String(error)`);
    } finally {
        if (trustMutationActor.value === actor) {
            trustMutationActor.value = null;
        }
    }
}
</script>

<style scoped>
.history-list {
    width: 100%;
    list-style: none;
    padding: 0.75rem;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
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

.history-actor-row {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.35rem;
}

.history-meta time {
    color: var(--secondary-color);
    font-size: 0.85rem;
}

.history-trust-inline {
    font-size: 0.85rem;
    color: var(--text-color);
}

.history-trust-inline button {
    margin-left: 0.25rem;
}

.history-list footer > ul {
    list-style: none;
    display: flex;
    gap: 0.85rem;
    margin: 0;
    padding: 0.15rem 0 0;
}
</style>

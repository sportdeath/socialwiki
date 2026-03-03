<template>
    <TwoPaneLayout leftTitle="History" rightTitle="Preview">
        <template #left-pane>
            <div class="history-pane-content">
                <section
                    v-if="isProtected === undefined"
                    class="protection-panel"
                >
                    <h3>Loading...</h3>
                </section>
                <section class="protection-panel" v-else>
                    <h3>
                        {{
                            isProtected ? "Protected Page" : "Unprotected Page"
                        }}
                    </h3>

                    <p v-if="isProtected">
                        This page has been marked as
                        <strong>protected</strong> by you or an editor you
                        trust. Only changes made or endorsed by a trusted editor
                        will be visible to you.
                    </p>
                    <p v-else>
                        This page has <strong>not</strong> been marked as
                        protected by your or an editor you trust. Anyone's
                        changes to this page will be visible to you.
                    </p>

                    <p v-if="$graffitiSession.value">
                        <button
                            type="button"
                            :disabled="
                                hasPendingMutation || isProtected === undefined
                            "
                            :class="{ warning: isProtected }"
                            @click="
                                handleUpdatePageProtection(
                                    $graffitiSession.value,
                                )
                            "
                        >
                            {{ protectionActionLabel }}
                        </button>
                    </p>
                    <p v-else>
                        <button @click="$graffiti.login()">
                            Log in to manage protection
                        </button>
                    </p>

                    <details
                        class="protection-history"
                        v-if="protectionHistory && protectionHistory.length"
                    >
                        <summary>Protection history</summary>
                        <ol class="protection-history-list">
                            <li
                                v-for="annotation in protectionHistory"
                                :key="annotation.url"
                            >
                                <p>
                                    {{
                                        annotation.value.activity === "Protect"
                                            ? "Protected"
                                            : "Protection removed"
                                    }}
                                    by
                                    <strong>
                                        <GraffitiActorToHandle
                                            :actor="annotation.actor"
                                        />
                                    </strong>
                                </p>
                                <time
                                    :datetime="
                                        new Date(
                                            annotation.value.published,
                                        ).toISOString()
                                    "
                                >
                                    {{
                                        new Date(
                                            annotation.value.published,
                                        ).toLocaleString()
                                    }}
                                </time>
                                <p
                                    v-if="
                                        $graffitiSession.value?.actor ===
                                        annotation.actor
                                    "
                                >
                                    <button
                                        type="button"
                                        class="warning"
                                        :disabled="hasPendingMutation"
                                        @click="
                                            undoProtectionHistory(
                                                annotation,
                                                $graffitiSession.value,
                                            )
                                        "
                                    >
                                        {{
                                            isUndoingProtection(annotation)
                                                ? "Undoing..."
                                                : "Undo"
                                        }}
                                    </button>
                                </p>
                            </li>
                        </ol>
                    </details>
                </section>

                <ol class="history-list">
                    <li
                        v-for="(version, index) in pageVersions"
                        :key="version.url"
                    >
                        <article
                            :id="version.url"
                            :class="{
                                selected: isSelected(version),
                                untrusted:
                                    isVersionUntrusted(version) &&
                                    !isSelected(version),
                            }"
                            role="button"
                            tabindex="0"
                            @click="selectPageVersion(version)"
                            @keydown.enter.self.prevent="
                                selectPageVersion(version)
                            "
                            @keydown.space.self.prevent="
                                selectPageVersion(version)
                            "
                        >
                            <header>
                                <h3>
                                    {{ formatSummary(version.value.summary) }}
                                </h3>
                            </header>

                            <div class="history-meta">
                                <p class="history-actor-row">
                                    <strong class="history-actor">
                                        <GraffitiActorToHandle
                                            :actor="version.actor"
                                        />
                                    </strong>
                                    <span
                                        v-if="
                                            isVersionUntrusted(version) &&
                                            !isSelected(version)
                                        "
                                        class="history-untrusted-indicator"
                                    >
                                        (Untrusted editor)
                                    </span>
                                    <span
                                        class="history-trust-inline"
                                        v-if="isSelected(version)"
                                    >
                                        <template
                                            v-if="
                                                $graffitiSession.value
                                                    ?.actor === version.actor
                                            "
                                        >
                                            <span>(You.)</span>
                                        </template>
                                        <template
                                            v-else-if="
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
                                                    !isUpdatingTrust(
                                                        version.actor,
                                                    )
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
                                                v-else-if="
                                                    isUpdatingTrust(
                                                        version.actor,
                                                    )
                                                "
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
                                                    !isUpdatingTrust(
                                                        version.actor,
                                                    )
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
                                                v-else-if="
                                                    isUpdatingTrust(
                                                        version.actor,
                                                    )
                                                "
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

                            <footer v-if="isSelected(version)">
                                <ul>
                                    <li
                                        v-if="
                                            $graffitiSession.value &&
                                            index !== 0
                                        "
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
                                    <li
                                        v-if="
                                            $graffitiSession.value &&
                                            index === 0 &&
                                            $graffitiSession.value.actor !==
                                                version.actor
                                        "
                                    >
                                        <button
                                            :disabled="hasPendingMutation"
                                            @click.stop="
                                                endorsePageVersion(
                                                    version,
                                                    $graffitiSession.value,
                                                )
                                            "
                                        >
                                            {{
                                                isEndorsingVersion(version)
                                                    ? "Endorsing..."
                                                    : "Endorse"
                                            }}
                                        </button>
                                    </li>
                                    <li>
                                        <a :href="editAddress"> Edit </a>
                                    </li>
                                    <li>
                                        <a :href="previewAddress"> Link </a>
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
            </div>
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
import TwoPaneLayout from "../utils/TwoPaneLayout.vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import {
    createPageVersion,
    deletePageVersion,
    pageVersionSchema,
    type PageVersionObject,
    sortPageVersions,
} from "../utils/page-versions";
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
import { annotationSchema, type AnnotationObject } from "../utils/schemas";
import { computeTrustAnnotationsByActor, trustActor } from "../utils/trust";
import { defaultTrustedEditors } from "../utils/default-trusted-editors";
import {
    sortProtectionHistory,
    updatePageProtection,
} from "../utils/protection";

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
const previewHtml = ref("");

const outputPreviewIfReady = () => {
    const preview = transclude.value;
    if (!preview) return;

    const status = preview.getAttribute("status");
    const html = preview.getAttribute("srcdoc");
    previewHtml.value = html ?? "";
    if (status === "ok" && html !== null) {
        outputLensStatus("ok", html);
    }
};
function onPreviewNavigate(event: Event) {
    if (
        !(event instanceof CustomEvent) ||
        typeof event.detail?.to !== "string"
    ) {
        return;
    }
    window.navigate(event.detail.to);
}

onMounted(() => {
    if (!transclude.value) return;
    previewObserver = new MutationObserver(outputPreviewIfReady);
    transclude.value.addEventListener(
        "sw-transclude-navigate",
        onPreviewNavigate,
    );
    previewObserver.observe(transclude.value, {
        attributes: true,
        attributeFilter: ["srcdoc"],
    });
    outputPreviewIfReady();
});

onBeforeUnmount(() => {
    previewObserver?.disconnect();
    transclude.value?.removeEventListener(
        "sw-transclude-navigate",
        onPreviewNavigate,
    );
});

const { objects: pageVersionsAndAnnotations, isFirstPoll } =
    useGraffitiDiscover(
        () => [pageName.value],
        () =>
            ({
                anyOf: [
                    pageVersionSchema(pageName.value),
                    annotationSchema(["Protect", "Remove"]),
                ],
            }) as const,
    );
const pageVersions = computed(() => {
    const pageVersionsRaw =
        pageVersionsAndAnnotations.value.filter<PageVersionObject>(
            (o): o is PageVersionObject => o.value.activity === "Update",
        );
    return sortPageVersions(pageVersionsRaw);
});
const protectionHistory = computed(() => {
    if (trustedEditors.value === undefined) return undefined;
    const annotationsRaw =
        pageVersionsAndAnnotations.value.filter<AnnotationObject>(
            (o): o is AnnotationObject =>
                o.value.activity === "Protect" || o.value.activity === "Remove",
        );
    return sortProtectionHistory(annotationsRaw, trustedEditors.value);
});
const isProtected = computed(() => {
    if (protectionHistory.value === undefined) return undefined;
    return protectionHistory.value.at(0)?.value.activity === "Protect";
});
const activeProtection = computed(() => {
    const latest = protectionHistory.value?.at(0);
    if (!latest || latest.value.activity !== "Protect") return null;
    return latest;
});

const graffiti = useGraffiti();
const restoringVersionUrl = ref<string | null>(null);
const endorsingVersionUrl = ref<string | null>(null);
const deletingVersionUrl = ref<string | null>(null);
const isUpdatingProtection = ref(false);
const undoingProtectionUrl = ref<string | null>(null);
const hasPendingMutation = computed(
    () =>
        restoringVersionUrl.value !== null ||
        endorsingVersionUrl.value !== null ||
        deletingVersionUrl.value !== null ||
        isUpdatingProtection.value ||
        undoingProtectionUrl.value !== null,
);
const protectionActionLabel = computed(() => {
    if (isUpdatingProtection.value) {
        return isProtected.value
            ? "Removing protection..."
            : "Protecting page...";
    }
    if (isProtected.value === undefined) return "Loading...";
    return isProtected.value ? "Remove protection" : "Protect this page";
});

async function handleUpdatePageProtection(session: GraffitiSession) {
    if (hasPendingMutation.value || isProtected.value === undefined) return;
    isUpdatingProtection.value = true;
    try {
        await updatePageProtection(
            graffiti,
            pageName.value,
            isProtected.value,
            activeProtection.value,
            session,
        );
    } catch (error) {
        console.error(`Error updating page protection: ${String(error)}`);
    } finally {
        isUpdatingProtection.value = false;
    }
}

const isUndoingProtection = (annotation: AnnotationObject) =>
    undoingProtectionUrl.value === annotation.url;

async function undoProtectionHistory(
    annotation: AnnotationObject,
    session: GraffitiSession,
) {
    if (hasPendingMutation.value) return;
    undoingProtectionUrl.value = annotation.url;
    try {
        await graffiti.delete(annotation, session);
    } finally {
        if (undoingProtectionUrl.value === annotation.url) {
            undoingProtectionUrl.value = null;
        }
    }
}

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

async function endorsePageVersion(
    version: PageVersionObject,
    session: GraffitiSession,
) {
    if (hasPendingMutation.value) return;
    const html = transclude.value?.getAttribute("srcdoc");
    if (!html) {
        console.error("no HTML to endorse");
        return;
    }
    endorsingVersionUrl.value = version.url;
    try {
        selectedPageVersion.value = await createPageVersion(
            graffiti,
            version.value.object,
            html,
            pageVersions.value.map<string>((v) => v.url),
            `Endorse: ${version.value.summary}`,
            session,
        );
    } finally {
        if (endorsingVersionUrl.value === version.url) {
            endorsingVersionUrl.value = null;
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

const effectiveSelectedPageVersion = computed(() => {
    if (isProtected.value === undefined) return null;

    const selected = selectedPageVersion.value;
    if (
        selected &&
        pageVersions.value.some((version) => version.url === selected.url)
    ) {
        return selected;
    }

    if (isProtected.value) {
        return (
            pageVersions.value.find((version) =>
                trustedEditors.value?.includes(version.actor),
            ) || null
        );
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
const editAddress = computed(
    () =>
        `#${composeRoute({
            lens: "e",
            lensParams: new URLSearchParams({
                draft: previewHtml.value,
            }),
            pageAddress: `${pageName.value}${pageHash.value}`,
        })}`,
);

const selectPageVersion = (version: PageVersionObject) => {
    if (isProtected.value === undefined) return;
    selectedPageVersion.value = version;
};

const isSelected = (version: PageVersionObject) =>
    effectiveSelectedPageVersion.value?.url === version.url;
const isRestoringVersion = (version: PageVersionObject) =>
    restoringVersionUrl.value === version.url;
const isEndorsingVersion = (version: PageVersionObject) =>
    endorsingVersionUrl.value === version.url;
const isDeletingVersion = (version: PageVersionObject) =>
    deletingVersionUrl.value === version.url;
const isVersionUntrusted = (version: PageVersionObject) =>
    isProtected.value === true &&
    trustedEditors.value !== undefined &&
    !trustedEditors.value.includes(version.actor);

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
const trustedEditors = computed(() => {
    if (trustAnnotationsByActor.value === undefined) return undefined;
    const trusted = new Set(
        [...trustAnnotationsByActor.value.entries()]
            .filter(([_, o]) => o === true || o?.value.activity === "Trust")
            .map(([actor]) => actor),
    );

    if (session.value?.actor) {
        trusted.add(session.value.actor);
    }

    return [...trusted];
});

const getActorTrustStatus = (actor: string) => {
    if (session.value?.actor === actor) return "self";
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
    if (actor === session.actor) return;
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
.history-pane-content {
    width: 100%;
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.protection-panel {
    width: 100%;
    display: grid;
    gap: 0.5rem;
    padding: 0.75rem;
    border-bottom: 1px solid var(--border-color);
}

.protection-panel h3 {
    margin: 0;
    font-size: 1rem;
}

.protection-help {
    color: var(--secondary-color);
    font-size: 0.9rem;
}

.protection-history > summary {
    cursor: pointer;
}

.protection-history-list {
    list-style: none;
    margin: 0.5rem 0 0;
    padding: 0;
    display: grid;
    gap: 0.5rem;
}

.protection-history-list > li {
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 0.5rem;
    display: grid;
    gap: 0.15rem;
}

.protection-history-list > li time {
    color: var(--secondary-color);
    font-size: 0.85rem;
}

.history-list {
    flex: 1;
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

.history-list > li > article.untrusted {
    border-style: dashed;
}

.history-list > li > article.untrusted h3 {
    color: var(--secondary-color);
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

.history-untrusted-indicator {
    font-size: 0.78rem;
    color: var(--secondary-color);
    font-style: italic;
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

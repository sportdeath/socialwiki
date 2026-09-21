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
                            isProtected ? "Protected Site" : "Unprotected Site"
                        }}
                    </h3>

                    <template v-if="isProtected">
                        <ProtectionNotice
                            :active-protection="activeProtection"
                            :is-protection-by-session-actor="
                                isProtectionBySessionActor
                            "
                            :active-protection-trust-source="
                                activeProtectionTrustSource
                            "
                        />
                        <p>
                            Only changes made or endorsed by your
                            <a :href="trustedEditorsRoute">trusted editors</a>
                            will be shown to you in the
                            <a :href="viewAddress">View</a> tab.
                        </p>
                    </template>
                    <p v-else>
                        This site has <strong>not</strong> been marked as
                        protected by you or an
                        <a :href="trustedEditorsRoute">editor you trust</a>.
                        Anyone's changes to this site will be visible to you.
                    </p>

                    <p v-if="$graffitiSession.value">
                        <button
                            type="button"
                            :disabled="
                                hasPendingMutation || isProtected === undefined
                            "
                            :class="{ warning: isProtected }"
                            @click="
                                handleUpdateSiteProtection(
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
                                        annotation.value.action === "Protect site"
                                            ? "Protected"
                                            : "Protection removed"
                                    }}
                                    by
                                    <strong>
                                        <GraffitiActorToHandle
                                            :actor="annotation.actor"
                                        />
                                    </strong>
                                    <span
                                        v-if="
                                            isActorInDefaultTrustedList(
                                                annotation.actor,
                                            )
                                        "
                                        class="history-default-indicator"
                                    >
                                        (Default trusted editor)
                                    </span>
                                </p>
                                <time
                                    :datetime="
                                        timestamp(
                                            annotation.value.time,
                                            true,
                                        )
                                    "
                                >
                                    {{ timestamp(annotation.value.time) }}
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
                        v-for="(version, index) in siteVersions"
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
                        >
                            <header>
                                <h3>
                                    <a
                                        class="version-select"
                                        :href="versionRoute(version)"
                                        :aria-current="
                                            isSelected(version)
                                                ? 'true'
                                                : undefined
                                        "
                                    >
                                        {{
                                            formatSummary(version.value.changes)
                                        }}
                                    </a>
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
                                            <span>
                                                ({{
                                                    isActorInDefaultTrustedList(
                                                        version.actor,
                                                    )
                                                        ? "Default trusted editor."
                                                        : "Trusted editor."
                                                }}
                                            </span>
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
                                        timestamp(version.value.time, true)
                                    "
                                >
                                    {{ timestamp(version.value.time) }}
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
                                                republishSiteVersion(
                                                    'Restore',
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
                                                republishSiteVersion(
                                                    'Endorse',
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
                                        <a :href="previewHref"> Link </a>
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
                                                deleteSelectedSiteVersion(
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
                v-if="previewAddress"
                key="preview"
                id="preview"
                name="Preview"
                :src="previewAddress"
                :route="previewRoute"
                @sw-lens-output="onPreviewOutput"
            ></sw-transclude>
            <sw-transclude
                v-else
                key="loading"
                id="preview"
                name="Preview"
                :srcdoc="LoadingPage"
            ></sw-transclude>
        </template>
    </TwoPaneLayout>
</template>

<script lang="ts" setup>
import ProtectionNotice from "../utils/ProtectionNotice.vue";
import TwoPaneLayout from "../utils/TwoPaneLayout.vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import {
    createSiteVersion,
    deleteSiteVersion,
    siteStateSchema,
    normalizeSiteVersions,
    pickVersion,
    type SiteVersionObject,
    sortSiteVersions,
} from "../utils/site-versions";
import {
    useGraffiti,
    GraffitiActorToHandle,
    useGraffitiDiscover,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import {
    computed,
    nextTick,
    onBeforeUnmount,
    ref,
    watch,
} from "vue";
import { trustSchema, isProtectionObject, type ProtectionObject } from "../utils/schemas";
import {
    computeTrustAnnotationsByActor,
    trustedActors,
    trustActor,
} from "../utils/trust";
import { defaultTrustedEditors } from "../utils/default-trusted-editors";
import {
    sortProtectionHistory,
    updateSiteProtection,
} from "../utils/protection";
import { LoadingPage } from "../utils/status-pages";

const { composeAddress, composeQuery, parseAddress } = window.route;

function emitLensOutput(status: string, srcdoc?: string) {
    window.emit("sw-lens-output", { status, srcdoc });
}

const siteName = ref("");
const siteQuery = ref("");
const historyParams = ref(new URLSearchParams());
const requestedVersionUrl = ref<string | null>(null);
let pendingVersionScroll: string | null = null;
let hasReceivedQuery = false;

function onQueryChange() {
    const { name: nextSiteName, query: nextSiteQuery } = parseAddress(
        window.address,
    );
    const nextVersionUrl = window.params.get("version");

    siteName.value = nextSiteName;
    siteQuery.value = nextSiteQuery;
    historyParams.value = new URLSearchParams(window.params);
    if (requestedVersionUrl.value !== nextVersionUrl) {
        pendingVersionScroll = hasReceivedQuery ? null : nextVersionUrl;
        requestedVersionUrl.value = nextVersionUrl;
    }
    hasReceivedQuery = true;
}
window.addEventListener("querychange", onQueryChange);
if (window.address !== undefined) onQueryChange();

const previewHtml = ref("");

function onPreviewOutput(event: CustomEvent<unknown>) {
    if (typeof event.detail !== "object" || event.detail === null) return;
    const { status, srcdoc } = event.detail as Record<string, unknown>;
    if (typeof status !== "string") return;
    if (status === "ok") {
        if (typeof srcdoc !== "string") return;
        previewHtml.value = srcdoc;
        emitLensOutput("ok", srcdoc);
    } else {
        previewHtml.value = "";
        emitLensOutput(status);
    }
}

onBeforeUnmount(() => {
    window.removeEventListener("querychange", onQueryChange);
});

const { objects: siteVersionsAndAnnotations, isFirstPoll } =
    useGraffitiDiscover(
        () => [siteName.value],
        () => siteStateSchema(siteName.value),
    );
const siteVersions = computed(() => {
    const siteVersionsRaw =
        normalizeSiteVersions(siteVersionsAndAnnotations.value, siteName.value);
    return sortSiteVersions(siteVersionsRaw);
});
const protectionHistory = computed(() => {
    if (trustedEditors.value === undefined) return undefined;
    const annotationsRaw =
        siteVersionsAndAnnotations.value.filter(isProtectionObject).filter(
            (object) => object.value["site name"] === siteName.value,
        );
    return sortProtectionHistory(annotationsRaw, trustedEditors.value);
});
const isProtected = computed(() => {
    if (protectionHistory.value === undefined) return undefined;
    return protectionHistory.value.at(0)?.value.action === "Protect site";
});
const activeProtection = computed(() => {
    const latest = protectionHistory.value?.at(0);
    if (!latest || latest.value.action !== "Protect site") return null;
    return latest;
});
const trustedEditorsRoute = "#/v?/trusted-editors";

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
            : "Protecting site...";
    }
    if (isProtected.value === undefined) return "Loading...";
    return isProtected.value ? "Remove protection" : "Protect this site";
});

async function handleUpdateSiteProtection(session: GraffitiSession) {
    if (hasPendingMutation.value || isProtected.value === undefined) return;
    isUpdatingProtection.value = true;
    try {
        await updateSiteProtection(
            graffiti,
            siteName.value,
            isProtected.value,
            activeProtection.value,
            session,
        );
    } catch (error) {
        reportError("Updating site protection", error);
    } finally {
        isUpdatingProtection.value = false;
    }
}

const isUndoingProtection = (annotation: ProtectionObject) =>
    undoingProtectionUrl.value === annotation.url;

async function undoProtectionHistory(
    annotation: ProtectionObject,
    session: GraffitiSession,
) {
    if (hasPendingMutation.value) return;
    undoingProtectionUrl.value = annotation.url;
    try {
        await graffiti.delete(annotation, session);
    } catch (error) {
        reportError("Undoing protection", error);
    } finally {
        if (undoingProtectionUrl.value === annotation.url) {
            undoingProtectionUrl.value = null;
        }
    }
}

async function republishSiteVersion(
    action: "Restore" | "Endorse",
    version: SiteVersionObject,
    session: GraffitiSession,
) {
    if (hasPendingMutation.value) return;
    const pending =
        action === "Restore" ? restoringVersionUrl : endorsingVersionUrl;
    pending.value = version.url;
    const predecessors = siteVersions.value.map((v) => v.url);
    try {
        // The preview may still show the previous selection. Publish the chosen
        // version's media, never whatever HTML happens to be rendered right now.
        const media = await graffiti.getMedia(version.value.document, {
            types: ["text/html"],
        });
        const created = await createSiteVersion(
            graffiti,
            version.value["site name"],
            await media.data.text(),
            predecessors,
            `${action}: ${version.value.changes}`,
            session,
        );
        if (siteName.value === version.value["site name"]) {
            window.navigate(versionRoute(created));
        }
    } catch (error) {
        reportError(action, error);
    } finally {
        pending.value = null;
    }
}

async function deleteSelectedSiteVersion(
    version: SiteVersionObject,
    session: GraffitiSession,
) {
    if (hasPendingMutation.value) return;
    deletingVersionUrl.value = version.url;
    try {
        await deleteSiteVersion(graffiti, version, session);
    } catch (error) {
        reportError("Deleting version", error);
    } finally {
        if (deletingVersionUrl.value === version.url) {
            deletingVersionUrl.value = null;
        }
    }
}

const effectiveSelectedSiteVersion = computed(() => {
    if (isProtected.value === undefined) return null;

    const selected = requestedVersionUrl.value
        ? siteVersions.value.find(
              (version) => version.url === requestedVersionUrl.value,
          )
        : undefined;
    // Protection chooses the default preview, but History still lets the user
    // explicitly inspect an untrusted version without endorsing it.
    if (selected) return selected;

    return pickVersion(
        siteVersions.value,
        trustedEditors.value ?? [],
        isProtected.value,
    );
});

const previewAddress = computed(() => {
    // Choose the version before starting View; otherwise it first loads the
    // latest site itself, then reloads when History supplies an explicit version.
    if (
        session.value === undefined ||
        isFirstPoll.value ||
        isProtected.value === undefined
    ) {
        return undefined;
    }
    const lensParams = new URLSearchParams();
    if (effectiveSelectedSiteVersion.value) {
        lensParams.set(
            "version",
            effectiveSelectedSiteVersion.value.value.document,
        );
    }

    return composeQuery(
        lensParams,
        composeAddress(siteName.value, siteQuery.value),
    );
});
// View resolves the private media ID above, while links expose History's
// public version-object URL. The route lets the navigation default translate
// between those two representations without a History-specific handler.
const previewRoute = computed(() =>
    composeQuery(historyParams.value, siteName.value),
);
const previewHref = computed(() =>
    previewAddress.value
        ? `#/${composeAddress("v", previewAddress.value)}`
        : undefined,
);
const viewAddress = computed(
    () =>
        `#/${composeAddress(
            "v",
            composeQuery(
                undefined,
                composeAddress(siteName.value, siteQuery.value),
            ),
        )}`,
);
const editAddress = computed(
    () =>
        `#/${composeAddress(
            "e",
            composeQuery(
                new URLSearchParams({
                    draft: previewHtml.value,
                }),
                composeAddress(siteName.value, siteQuery.value),
            ),
        )}`,
);

function versionRoute(version: SiteVersionObject) {
    const params = new URLSearchParams(window.params);
    params.set("version", version.url);
    return composeQuery(
        params,
        composeAddress(siteName.value, siteQuery.value),
    );
}

const isSelected = (version: SiteVersionObject) =>
    effectiveSelectedSiteVersion.value?.url === version.url;
const isRestoringVersion = (version: SiteVersionObject) =>
    restoringVersionUrl.value === version.url;
const isEndorsingVersion = (version: SiteVersionObject) =>
    endorsingVersionUrl.value === version.url;
const isDeletingVersion = (version: SiteVersionObject) =>
    deletingVersionUrl.value === version.url;
const isVersionUntrusted = (version: SiteVersionObject) =>
    isProtected.value === true &&
    trustedEditors.value !== undefined &&
    !trustedEditors.value.includes(version.actor);

const formatSummary = (summary?: string) =>
    summary?.trim() || "No summary provided";

function reportError(action: string, error: unknown) {
    console.error(action, error);
    alert(
        `${action} failed: ${error instanceof Error ? error.message : String(error)}`,
    );
}

function timestamp(value: number, exact = false) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()))
        return exact ? undefined : "Unknown time";
    return exact ? date.toISOString() : date.toLocaleString();
}

watch(
    [requestedVersionUrl, siteVersions],
    async ([versionUrl, versions]) => {
        if (
            !versionUrl ||
            pendingVersionScroll !== versionUrl ||
            !versions.some((version) => version.url === versionUrl)
        ) {
            return;
        }

        await nextTick();
        if (requestedVersionUrl.value !== versionUrl) return;
        const entry = document.getElementById(versionUrl);
        if (!entry) return;
        entry.scrollIntoView({ behavior: "smooth", block: "start" });
        pendingVersionScroll = null;
    },
    { immediate: true },
);

watch([siteVersions, isFirstPoll], ([versions, firstPoll]) => {
    if (firstPoll) return;
    if (!versions.length) {
        emitLensOutput("not-found");
    }
});

const session = useGraffitiSession();
const { objects: trustAnnotations, isFirstPoll: isTrustAnnotationLoading } =
    useGraffitiDiscover(
        () => (session.value ? [session.value.actor] : []),
        () => trustSchema(session.value?.actor),
    );
const trustAnnotationsByActor = computed(() => {
    if (isTrustAnnotationLoading.value) return undefined;
    return computeTrustAnnotationsByActor(
        trustAnnotations.value,
        defaultTrustedEditors,
    );
});
const defaultTrustedEditorSet = new Set(defaultTrustedEditors);
const trustedEditors = computed(() => {
    if (trustAnnotationsByActor.value === undefined) return undefined;
    return trustedActors(trustAnnotationsByActor.value, session.value?.actor);
});

const getActorTrustStatus = (actor: string) => {
    if (session.value?.actor === actor) return "self";
    const byActor = trustAnnotationsByActor.value;
    if (!byActor) return "loading";
    const trustValue = byActor.get(actor);
    return trustValue === true || trustValue?.value.action === "Trust editor"
        ? "trusted"
        : "untrusted";
};
const isActorInDefaultTrustedList = (actor: string) =>
    defaultTrustedEditorSet.has(actor);
const isProtectionBySessionActor = computed(
    () => activeProtection.value?.actor === session.value?.actor,
);
const activeProtectionTrustSource = computed(() => {
    const actor = activeProtection.value?.actor;
    if (!actor || isProtectionBySessionActor.value) return null;
    return trustAnnotationsByActor.value?.get(actor) === true
        ? "default"
        : "trusted";
});

// Register this only after every computed dependency above exists: Vue reads
// the source once when a watcher is created, even when it is not immediate.
watch(
    [
        siteName,
        () => effectiveSelectedSiteVersion.value?.value.document,
    ],
    () => {
        // The previous version is no longer the document shown by History,
        // even while the replacement View lens is still loading.
        previewHtml.value = "";
        emitLensOutput("loading");
    },
    { immediate: true },
);

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
        reportError("Updating editor trust", error);
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
    cursor: pointer;
    position: relative;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    padding: 0.75rem;
    display: grid;
    gap: 0.45rem;
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

.version-select:focus-visible {
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

.version-select {
    display: block;
    width: 100%;
    text-align: start;
    font: inherit;
    color: inherit;
}

/* Make the card itself part of the version link while keeping its controls
   and actor link independently interactive. */
.version-select::after {
    content: "";
    position: absolute;
    inset: 0;
}

.history-actor,
.history-trust-inline,
.history-list footer {
    position: relative;
    z-index: 1;
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

.history-default-indicator {
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

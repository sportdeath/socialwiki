<template>
    <main>
        <SourceEditor
            ref="sourceEditor"
            v-model="editorHtml"
            :baseline="baselineHtml ?? ''"
            :publishing="publishing"
            :should-shake-publish="shouldShakePublish"
            @publish="openPublishDialog"
            @download="download"
        >
            <template #preview-controls>
                <nav class="editor-controls">
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

            <!-- Right pane body (Preview) -->
            <template #preview>
                <div class="pane">
                    <sw-transclude
                        @sw-navigate="onPreviewNavigate"
                        :id="previewTranscludeId"
                        name="Preview"
                        :query="pageQuery"
                        :key="refreshKey"
                        :srcdoc="previewHtml"
                    ></sw-transclude>
                </div>
            </template>
        </SourceEditor>

        <PublishDialog
            v-model="showPublishDialog"
            :page-name="pageName"
            :publishing="publishing"
            @publish="submitPublishDialog"
        />

        <ProtectedDialog
            v-model="showProtectedDialog"
            :active-protection="activeProtection"
            :is-protection-by-session-actor="isProtectionBySessionActor"
            :active-protection-trust-source="activeProtectionTrustSource"
            :history-route="historyRoute"
            @cancel="cancelProtectedEdit"
        />

        <div v-if="publishing" class="backdrop" @click.prevent="">
            <h1 class="dots">Publishing</h1>
        </div>
    </main>
</template>

<script setup lang="ts">
import {
    ref,
    watch,
    computed,
    onBeforeUnmount,
    onMounted,
    useTemplateRef,
} from "vue";
import SourceEditor from "./SourceEditor.vue";
import PublishDialog from "./PublishDialog.vue";
import ProtectedDialog from "./ProtectedDialog.vue";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/wrapper-vue";
import { createPageVersion, getPageVersions } from "../utils/page-versions";
import { randomBytes, bytesToHex } from "@noble/hashes/utils.js";
import { annotationSchema, type AnnotationObject } from "../utils/schemas";
import { getTrustContext } from "../utils/trust";
import { sortProtectionHistory } from "../utils/protection";
import { starterHtml } from "./starter";

const { composeAddress, composeQuery, parseAddress } = window.route;

const sourceEditor =
    useTemplateRef<InstanceType<typeof SourceEditor>>("sourceEditor");
const previewTranscludeId = bytesToHex(randomBytes());
// The starting draft (or last successful publish), not necessarily published data.
const baselineHtml = ref<string | null>(null);

// Initialize the editor, diff and preview with the existing HTML
const editorHtml = ref("");
const previewHtml = ref("");
const hasUnsavedChanges = computed(
    () =>
        baselineHtml.value !== null && editorHtml.value !== baselineHtml.value,
);
const hasShownPublishReminder = ref(false);
const shouldShakePublish = ref(false);
let publishShakeTimeout: number | null = null;
function resetPublishReminderState() {
    hasShownPublishReminder.value = false;
    shouldShakePublish.value = false;
    if (publishShakeTimeout !== null) {
        clearTimeout(publishShakeTimeout);
        publishShakeTimeout = null;
    }
}
// Load incoming drafts together without scheduling them as local edits.
let applyingDraft = false;
function loadDraft(html: string) {
    applyingDraft = true;
    try {
        editorHtml.value = html;
        previewHtml.value = html;
    } finally {
        applyingDraft = false;
    }
}
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

function onPreviewNavigate(e: Event) {
    if (!(e instanceof CustomEvent) || typeof e.detail?.to !== "string") return;
    e.preventDefault();
    const to = e.detail.to;

    // If not relative, just pass it on
    if (!to.startsWith("?")) return window.navigate(to);

    // If it is relative, add the page name and the params
    const { name } = parseAddress(window.address);
    const newTo = composeQuery(window.params, composeAddress(name, to));
    window.navigate(newTo);
}

const pageName = ref("");
const pageQuery = ref("");
const pageAddress = computed(() =>
    composeAddress(pageName.value, pageQuery.value),
);
const historyRoute = computed(
    () =>
        `#/${composeAddress("h", composeQuery(undefined, pageAddress.value))}`,
);
const viewRoute = computed(
    () =>
        `#/${composeAddress("v", composeQuery(undefined, pageAddress.value))}`,
);
const activeProtection = ref<AnnotationObject | null>(null);
const activeProtectionTrustSource = ref<"default" | "trusted" | null>(null);
const showProtectedDialog = ref(false);
let activeProtectionRequest = 0;
let localDraftSeq = 0;
const session = useGraffitiSession();
const graffiti = useGraffiti();
const isProtectionBySessionActor = computed(
    () => activeProtection.value?.actor === session.value?.actor,
);

function cancelProtectedEdit() {
    showProtectedDialog.value = false;
    window.navigate(viewRoute.value);
}

async function waitForSessionStatusKnown() {
    if (session.value !== undefined) return;
    await new Promise<void>((resolve) => {
        const handleSessionReady = () => {
            graffiti.sessionEvents.removeEventListener(
                "initialized",
                handleSessionReady,
            );
            graffiti.sessionEvents.removeEventListener(
                "login",
                handleSessionReady,
            );
            graffiti.sessionEvents.removeEventListener(
                "logout",
                handleSessionReady,
            );
            resolve();
        };
        graffiti.sessionEvents.addEventListener(
            "initialized",
            handleSessionReady,
        );
        graffiti.sessionEvents.addEventListener("login", handleSessionReady);
        graffiti.sessionEvents.addEventListener("logout", handleSessionReady);
    });
}

async function getProtectionAnnotations(page: string) {
    const protectionByUrl = new Map<string, AnnotationObject>();
    for await (const result of graffiti.discover(
        [page],
        annotationSchema(["Protect", "Remove"]),
    )) {
        if (result.error) {
            console.error(result.error);
            continue;
        }
        if (result.tombstone) {
            protectionByUrl.delete(result.object.url);
        } else {
            protectionByUrl.set(
                result.object.url,
                result.object as AnnotationObject,
            );
        }
    }

    return [...protectionByUrl.values()];
}

async function refreshPageProtection(page: string, requestId: number) {
    activeProtection.value = null;
    activeProtectionTrustSource.value = null;
    showProtectedDialog.value = false;
    try {
        await waitForSessionStatusKnown();
        if (requestId !== activeProtectionRequest) return;

        const [trustedEditorsContext, protectionAnnotations] =
            await Promise.all([
                getTrustContext(graffiti, session.value),
                getProtectionAnnotations(page),
            ]);
        if (requestId !== activeProtectionRequest) return;

        const protectionHistory = sortProtectionHistory(
            protectionAnnotations,
            trustedEditorsContext.trustedEditors,
        );
        const latestProtection = protectionHistory.at(0);
        const isProtected = latestProtection?.value.activity === "Protect";
        if (isProtected && latestProtection) {
            activeProtection.value = latestProtection;
            if (latestProtection.actor !== session.value?.actor) {
                activeProtectionTrustSource.value =
                    trustedEditorsContext.trustByActor.get(
                        latestProtection.actor,
                    ) === true
                        ? "default"
                        : "trusted";
            }
        }
        showProtectedDialog.value = isProtected;
    } catch (error) {
        console.error(`Error checking page protection: ${String(error)}`);
        if (requestId !== activeProtectionRequest) return;
        activeProtection.value = null;
        activeProtectionTrustSource.value = null;
        showProtectedDialog.value = false;
    }
}

function onQueryChange() {
    if (window.address === undefined) return;

    const lensParams = new URLSearchParams(window.params);
    const { name: nextPageName, query: nextPageQuery } = parseAddress(
        window.address,
    );
    const didChangePage = pageName.value !== nextPageName;

    pageName.value = nextPageName;
    pageQuery.value = nextPageQuery;

    if (didChangePage) {
        const requestId = ++activeProtectionRequest;
        void refreshPageProtection(nextPageName, requestId);
    }

    const searchDraft = lensParams.get("draft");
    const incomingDraftSeq = Number(lensParams.get("draftSeq"));
    // Draft updates travel through the browser's route and come back here.
    // An older echo must not overwrite edits typed while it was in flight.
    const isLocalDraftEcho =
        !didChangePage &&
        Number.isFinite(incomingDraftSeq) &&
        incomingDraftSeq > 0 &&
        incomingDraftSeq <= localDraftSeq;
    if (didChangePage || baselineHtml.value === null) {
        cancelDraftUpdate();
        localDraftSeq = 0;
        // An empty incoming draft is intentional; only a missing draft uses the starter.
        const html = searchDraft ?? starterHtml(pageName.value);
        loadDraft(html);
        baselineHtml.value = html;
        resetPublishReminderState();
    } else if (searchDraft !== null && !isLocalDraftEcho) {
        cancelDraftUpdate();
        loadDraft(searchDraft);
    }
}
window.addEventListener("querychange", onQueryChange);

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

const showPublishDialog = ref(false);
// --- Draft and preview updates -----------------------------

// Manually refresh the preview
// Changing the key reloads even unchanged HTML; srcdoc alone reuses its frame.
const refreshKey = ref(0);
function refreshPreview() {
    previewHtml.value = editorHtml.value;
    refreshKey.value++;
    debouncing.value = false;
}

// Preview option
const livePreview = ref(true);

// Persist every draft; auto-refresh controls only whether it is also rendered.
const DEBOUNCE_DELAY = 500;
let timeout: number | null = null;
onBeforeUnmount(() => {
    cancelDraftUpdate();
    if (publishShakeTimeout !== null) clearTimeout(publishShakeTimeout);
});
const debouncing = ref(false);
function cancelDraftUpdate() {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
    debouncing.value = false;
}
const scheduleDraftUpdate = (newHtml: string) => {
    debouncing.value = livePreview.value;
    if (timeout !== null) clearTimeout(timeout);
    timeout = window.setTimeout(() => {
        if (livePreview.value) previewHtml.value = newHtml;
        const draftSeq = ++localDraftSeq;

        // Set the draft HTML
        window.navigate(
            composeQuery(
                new URLSearchParams({
                    draft: newHtml,
                    draftSeq: String(draftSeq),
                }),
                composeAddress(pageName.value, pageQuery.value),
            ),
        );

        debouncing.value = false;
        timeout = null;
    }, DEBOUNCE_DELAY);
};
watch(
    editorHtml,
    (newHtml) => {
        // Reverting to the displayed HTML must cancel an older pending draft too.
        cancelDraftUpdate();
        if (applyingDraft) return;
        scheduleDraftUpdate(newHtml);
    },
    { flush: "sync" },
);

// When auto-refresh is turned on, refresh once immediately
watch(livePreview, (enabled) => {
    if (enabled) refreshPreview();
    else debouncing.value = false;
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
});
onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", beforeUnload);
    window.removeEventListener("querychange", onQueryChange);
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

async function openPublishDialog() {
    if (publishing.value) return;
    sourceEditor.value?.closeMenu();
    try {
        const publishSession = await ensurePublishSession();
        if (!publishSession) return;
    } catch (error) {
        console.error("Error opening publish dialog:", error);
        return;
    }
    showPublishDialog.value = true;
}

async function ensurePublishSession() {
    if (session.value) return session.value;
    bypassBeforeUnload.value = true;
    setupLoginBypassListener();
    try {
        await graffiti.login();
    } catch (error) {
        clearLoginBypassListener();
        bypassBeforeUnload.value = false;
        throw error;
    }

    if (!session.value) {
        clearLoginBypassListener();
        bypassBeforeUnload.value = false;
    }
    return session.value;
}

async function submitPublishDialog(publishName: string, summary: string) {
    if (publishing.value) return;
    publishing.value = true;
    showPublishDialog.value = false;
    try {
        const publishSession = await ensurePublishSession();
        if (!publishSession) return;

        const nextPublishedHtml = editorHtml.value;
        const existingVersions = await getPageVersions(graffiti, publishName);
        await createPageVersion(
            graffiti,
            publishName,
            nextPublishedHtml,
            existingVersions.map((version) => version.url),
            summary,
            publishSession,
        );
        loadDraft(nextPublishedHtml);
        baselineHtml.value = nextPublishedHtml;
        resetPublishReminderState();
        window.navigate(
            `#/${composeAddress(
                "v",
                composeQuery(
                    undefined,
                    composeAddress(publishName, pageQuery.value),
                ),
            )}`,
        );
    } catch (error) {
        console.error("Error publishing changes:", error);
        const reason =
            error instanceof Error && error.message.length > 0
                ? error.message
                : String(error);
        alert(`Publishing failed: ${reason}`);
    } finally {
        publishing.value = false;
    }
}
// All editor/preview state must exist before applying an already-received query.
onQueryChange();
</script>

<style scoped>
.pane {
    width: 100%;
    display: flex;
    flex-direction: column;
}

.backdrop {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: var(--backdrop-color);
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
}
</style>

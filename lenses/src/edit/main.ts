import { createApp } from "vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import {
    ref,
    watch,
    computed,
    onBeforeUnmount,
    onMounted,
    useTemplateRef,
} from "vue";
import SourceEditor, { type SourceEditorHandle } from "./SourceEditor/main";
import PathChoices, { type EditPath } from "./PathChoices/main";
import AiEditor from "./AiEditor/main";
import LocalEditor from "./LocalEditor/main";
import PublishDialog from "./PublishDialog/main";
import ProtectedDialog from "./ProtectedDialog/main";
import { useGraffiti, useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";
import { createSiteVersion, type SiteVersionObject } from "../utils/site-versions";
import {
    isProtectionObject,
    protectionSchema,
    type ProtectionObject,
} from "../utils/schemas";
import { useTrustContext } from "../utils/use-trust-context";
import { sortProtectionHistory } from "../utils/protection";
import starterHtml from "./starter.html?raw";
import { siteChannels } from "../utils/site-channel";
import { authoringGuideSourceUrl, authoringGuideUrl } from "./authoring";
import { folderName } from "./local-files";


function setup() {
    const { composeAddress, composeQuery, parseAddress } = window.route;

    const sourceEditor =
        useTemplateRef<SourceEditorHandle>("sourceEditor");
    const selectedPath = ref<EditPath | null>(null);
    const siteMode = ref<"create" | "edit" | null>(null);
    const aiResultPasted = ref(false);
    const localPreviewReady = ref(false);
    watch(selectedPath, (path) => {
        if (path !== "local") localPreviewReady.value = false;
    });
    const guideText = ref<string | null>(null);
    const guideError = ref("");
    async function loadGuide() {
        guideError.value = "";
        try {
            const response = await fetch(authoringGuideSourceUrl);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            guideText.value = await response.text();
        } catch (error) {
            guideError.value = `Could not load the authoring guide: ${String(error)}`;
        }
    }
    onMounted(() => { void loadGuide(); });
    const previewTranscludeId = crypto.randomUUID();
    // The starting draft (or last successful publish), not necessarily published data.
    const baselineHtml = ref<string | null>(null);

    // Initialize the editor, diff and preview with the existing HTML
    const editorHtml = ref("");
    const previewHtml = ref("");
    // The minimal base is only a starting point for the code and local paths.
    // AI creation stays full screen until there is an actual result.
    const hasWorkingDocument = computed(() =>
        siteMode.value === "edit" ||
        (!!editorHtml.value.trim() && editorHtml.value !== starterHtml),
    );
    // New local sites show a preview only after files are connected or uploaded.
    const isSplitWorkflow = computed(() =>
        selectedPath.value === "local"
            ? siteMode.value === "edit" || localPreviewReady.value
            : selectedPath.value === "code" || hasWorkingDocument.value,
    );
    const hasUnsavedChanges = computed(
        () =>
            baselineHtml.value !== null &&
            editorHtml.value !== baselineHtml.value &&
            !(siteMode.value === "create" && editorHtml.value === starterHtml),
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

    const siteName = ref("");
    const siteQuery = ref("");
    const editParams = ref(new URLSearchParams());
    const siteAddress = computed(() =>
        composeAddress(siteName.value, siteQuery.value),
    );
    const previewRoute = computed(() =>
        composeQuery(editParams.value, siteName.value),
    );
    const historyRoute = computed(
        () =>
            `#/${composeAddress("h", composeQuery(undefined, siteAddress.value))}`,
    );
    const viewRoute = computed(
        () =>
            `#/${composeAddress("v", composeQuery(undefined, siteAddress.value))}`,
    );
    const { session, trustByActor, trustedEditors } = useTrustContext();
    const graffiti = useGraffiti();
    const { objects: protectionAnnotations, isFirstPoll: protectionLoading } =
        useGraffitiDiscover(
            () => (siteName.value ? siteChannels(siteName.value) : []),
            () => protectionSchema(siteName.value),
        );
    const activeProtection = computed<ProtectionObject | null>(() => {
        if (protectionLoading.value || !trustedEditors.value) return null;
        const history = sortProtectionHistory(
            protectionAnnotations.value
                .filter(isProtectionObject)
                .filter((object) => object.value["site name"] === siteName.value),
            trustedEditors.value,
        );
        const latest = history.at(0);
        return latest?.value.action === "Protect site" ? latest : null;
    });
    const activeProtectionTrustSource = computed<"default" | "trusted" | null>(
        () => {
            const protection = activeProtection.value;
            if (!protection || protection.actor === session.value?.actor)
                return null;
            return trustByActor.value?.get(protection.actor) === true
                ? "default"
                : "trusted";
        },
    );
    const showProtectedDialog = ref(false);
    watch(activeProtection, (protection) => {
        showProtectedDialog.value = protection !== null;
    });
    let localDraftSeq = 0;
    const initialDraftForPath = () =>
        selectedPath.value === "local" || selectedPath.value === "code"
            ? starterHtml : "";
    const isProtectionBySessionActor = computed(
        () =>
            !!activeProtection.value &&
            activeProtection.value.actor === session.value?.actor,
    );

    function onQueryChange() {
        if (window.address === undefined) return;

        const lensParams = window.params;
        const { name: nextSiteName, query: nextSiteQuery } = parseAddress(
            window.address,
        );
        const didChangeSite = siteName.value !== nextSiteName;
        if (didChangeSite) {
            aiResultPasted.value = false;
            localPreviewReady.value = false;
        }

        siteName.value = nextSiteName;
        siteQuery.value = nextSiteQuery;
        editParams.value = lensParams;
        const routePath = lensParams.get("path");
        selectedPath.value = routePath === "ai" || routePath === "local" || routePath === "code"
            ? routePath : null;

        const searchDraft = lensParams.get("draft");
        // The browser seeds Edit with the displayed document as a draft. Without
        // one, default to Create; siteMode carries that choice through later drafts.
        if (lensParams.get("aiPasted") === "1") aiResultPasted.value = true;
        const routeMode = lensParams.get("siteMode");
        const incomingDraftSeq = Number(lensParams.get("draftSeq"));
        // Draft updates travel through the browser's route and come back here.
        // An older echo must not overwrite edits typed while it was in flight.
        const isLocalDraftEcho =
            !didChangeSite &&
            Number.isFinite(incomingDraftSeq) &&
            incomingDraftSeq > 0 &&
            incomingDraftSeq <= localDraftSeq;
        if (didChangeSite || baselineHtml.value === null) {
            cancelDraftUpdate();
            localDraftSeq = 0;
            // An empty draft is intentional; only a missing draft uses the path's base.
            if (searchDraft !== null) {
                loadDraft(searchDraft);
                baselineHtml.value = searchDraft;
                siteMode.value = routeMode === "create" ? "create" : "edit";
            } else {
                loadDraft(initialDraftForPath());
                baselineHtml.value = "";
                siteMode.value = routeMode === "edit" ? "edit" : "create";
            }
            resetPublishReminderState();
        } else if (searchDraft !== null && !isLocalDraftEcho) {
            cancelDraftUpdate();
            loadDraft(searchDraft);
        }

        // Local edits reach this point after the draft navigation debounce.
        window.emit("sw-lens-output", { status: "ok", srcdoc: editorHtml.value });
    }
    window.addEventListener("querychange", onQueryChange);

    function download() {
        const blob = new Blob([editorHtml.value], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${folderName(siteName.value)}.html`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function choosePath(path: EditPath | null) {
        if (siteMode.value === null) return;
        cancelDraftUpdate();
        const params = new URLSearchParams(editParams.value);
        if (path) params.set("path", path);
        else params.delete("path");
        params.set("siteMode", siteMode.value);
        if (editorHtml.value) {
            params.set("draft", editorHtml.value);
            params.set("draftSeq", String(++localDraftSeq));
        }
        selectedPath.value = path;
        editParams.value = params;
        window.navigate(composeQuery(params, siteAddress.value));
        if ((path === "local" || path === "code") && !editorHtml.value) {
            editorHtml.value = starterHtml;
            previewHtml.value = editorHtml.value;
        }
    }

    function persistAiResult() {
        cancelDraftUpdate();
        const params = new URLSearchParams(editParams.value);
        // Keep the paste/publish step available after a route reload.
        params.set("aiPasted", "1");
        params.set("draft", editorHtml.value);
        params.set("draftSeq", String(++localDraftSeq));
        if (siteMode.value) params.set("siteMode", siteMode.value);
        editParams.value = params;
        window.navigate(composeQuery(params, siteAddress.value));
    }

    function pasteAiResult(html: string) {
        editorHtml.value = html;
        refreshPreview();
        aiResultPasted.value = true;
        persistAiResult();
    }

    function updateLocalHtml(html: string) {
        editorHtml.value = html;
        refreshPreview();
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
            const params = new URLSearchParams(editParams.value);
            params.set("draft", newHtml);
            params.set("draftSeq", String(draftSeq));
            if (siteMode.value) params.set("siteMode", siteMode.value);

            // Set the draft HTML
            window.navigate(
                composeQuery(
                    params,
                    composeAddress(siteName.value, siteQuery.value),
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
    });

    const publishing = ref(false);
    watch(
        session,
        (current) => {
            if (current) bypassBeforeUnload.value = false;
        },
        { flush: "sync" },
    );

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
        try {
            await graffiti.login();
        } finally {
            bypassBeforeUnload.value = false;
        }
        return session.value;
    }

    async function submitPublishDialog(
        publishName: string,
        summary: string,
        existingVersions: SiteVersionObject[],
    ) {
        if (publishing.value) return;
        publishing.value = true;
        showPublishDialog.value = false;
        try {
            const publishSession = await ensurePublishSession();
            if (!publishSession) return;

            const nextPublishedHtml = editorHtml.value;
            await createSiteVersion(
                graffiti,
                publishName,
                nextPublishedHtml,
                existingVersions,
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
                        composeAddress(publishName, siteQuery.value),
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

    return {
        activeProtection,
        activeProtectionTrustSource,
        aiResultPasted,
        authoringGuideUrl,
        baselineHtml,
        choosePath,
        debouncing,
        download,
        editorHtml,
        guideError,
        guideText,
        hasWorkingDocument,
        historyRoute,
        isProtectionBySessionActor,
        isSplitWorkflow,
        livePreview,
        loadGuide,
        localPreviewReady,
        openPublishDialog,
        pasteAiResult,
        previewHtml,
        previewRoute,
        previewTranscludeId,
        publishing,
        refreshKey,
        refreshPreview,
        selectedPath,
        shouldShakePublish,
        showProtectedDialog,
        showPublishDialog,
        siteAddress,
        siteMode,
        siteName,
        siteQuery,
        submitPublishDialog,
        updateLocalHtml,
        viewRoute,
    };
}

createApp({
    template: "#edit-template",
    components: { SourceEditor, PathChoices, AiEditor, LocalEditor, PublishDialog, ProtectedDialog },
    setup,
}).use(GraffitiPlugin, { graffiti: new window.Graffiti() }).mount("#app");

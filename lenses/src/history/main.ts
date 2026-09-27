import ProtectionNotice from "../utils/ProtectionNotice/main";
import TwoPaneLayout from "../utils/TwoPaneLayout/main";
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
  GraffitiPlugin,
} from "@graffiti-garden/wrapper-vue";
import {
  computed,
  createApp,
  defineComponent,
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
import { ErrorPage, LoadingPage } from "../utils/status-pages";

const { composeAddress, composeQuery, parseAddress } = window.route;

function emitLensOutput(status: string, srcdoc?: string) {
  window.emit("sw-lens-output", { status, srcdoc });
}

function setup() {
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

  const { objects: siteVersionsAndAnnotations, error: siteError, isFirstPoll } =
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
    const knownVersions = [...siteVersions.value];
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
        knownVersions,
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
  const {
    objects: trustAnnotations,
    error: trustError,
    isFirstPoll: isTrustAnnotationLoading,
  } = useGraffitiDiscover(
    () => (session.value ? [session.value.actor] : []),
    () => trustSchema(session.value?.actor),
  );
  const discoveryError = computed(() =>
    (isFirstPoll.value && siteError.value) ||
    (isTrustAnnotationLoading.value && trustError.value),
  );
  const previewStatusPage = computed(() =>
    discoveryError.value
      ? ErrorPage(`Could not check site data: ${discoveryError.value.message}. Retrying…`)
      : LoadingPage,
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
  return {
    activeProtection,
    activeProtectionTrustSource,
    deleteSelectedSiteVersion,
    discoveryError,
    editAddress,
    effectiveSelectedSiteVersion,
    formatSummary,
    getActorTrustStatus,
    handleUpdateSiteProtection,
    hasPendingMutation,
    isActorInDefaultTrustedList,
    isDeletingVersion,
    isEndorsingVersion,
    isProtected,
    isRestoringVersion,
    isSelected,
    isUndoingProtection,
    isUpdatingTrust,
    isVersionUntrusted,
    onPreviewOutput,
    previewAddress,
    previewHref,
    previewRoute,
    protectionActionLabel,
    protectionHistory,
    republishSiteVersion,
    siteVersions,
    timestamp,
    toggleActorTrust,
    trustedEditorsRoute,
    undoProtectionHistory,
    versionRoute,
    viewAddress,
    isProtectionBySessionActor,
    previewStatusPage,
  };
}

createApp({
  template: "#history-template",
  components: { TwoPaneLayout, ProtectionNotice, GraffitiActorToHandle },
  setup,
}).use(GraffitiPlugin, { graffiti: new window.Graffiti() })
  .mount("#app");

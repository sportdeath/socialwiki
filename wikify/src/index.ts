import { computed, createApp, onScopeDispose, ref, watch } from "vue";
import {
  GraffitiPlugin,
  useGraffiti,
  useGraffitiDiscover,
  useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import type { Graffiti } from "@graffiti-garden/api";
import template from "./template.html";
import css from "./style.css";
import {
  followsOwnVersion, isSiteVersion, newestFirst,
  versionFollowSchema, versionSchema,
} from "./versions";

declare global {
  interface Window {
    Graffiti: new () => Graffiti;
    query: string;
    route: {
      composeAddress(name: string, query: string): string;
      composeQuery(params?: URLSearchParams, address?: string): string;
      parseQuery(query: string): { params?: URLSearchParams; address?: string };
    };
    urlFor(to: string): string;
    showPermissions(): Promise<void>;
  }
}

export interface WikifyOptions {
  siteName: string;
  admins: string[];
  title?: string;
  mount?: string | HTMLElement;
  /** Optional guidelines shown before opening the editor. */
  editingGuidelines?: readonly string[];
  /** Receives the complete query, including parameters and address. */
  showHeader?: (query: string) => boolean;
}

let mounted = false;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Mount a collaboratively editable site shell inside a Social.Wiki document. */
export function wikify(options: WikifyOptions): void {
  // init.js serializes the host page and replaces it, so rather than
  // running in both places, stop early if we are at the top
  if (window.top === window) return;

  if (mounted) throw new Error("Wikify is already mounted in this document");
  if (!options.siteName?.trim()) throw new Error("Wikify requires a siteName");
  if (!options.admins?.length) throw new Error("Wikify requires at least one admin");
  if (typeof window.Graffiti !== "function") {
    throw new Error("Load Social.Wiki init.js before calling wikify()");
  }

  const mount = typeof options.mount === "string"
    ? document.querySelector<HTMLElement>(options.mount)
    : options.mount ?? document.querySelector<HTMLElement>("#wikify");
  if (!mount) throw new Error("Wikify mount element was not found");

  const siteName = options.siteName;
  const admins = [...new Set(options.admins)];
  const title = options.title || document.title || siteName;
  const editingGuidelines = options.editingGuidelines ?? [];
  document.title = title;
  document.body.classList.add("wikify-page");
  mount.classList.add("wikify");
  const style = document.createElement("style");
  style.textContent = css;
  // Site-authored style rules remain later in the cascade, so normal CSS can
  // override any default without a JavaScript styling API.
  document.head.prepend(style);

  function setup() {
    const graffiti = useGraffiti();
    const session = useGraffitiSession();
    const isAdmin = computed(() => !!session.value && admins.includes(session.value.actor));
    const publishers = computed(() => [...new Set([
      ...admins,
      ...(session.value?.actor ? [session.value.actor] : []),
    ])]);
    const { objects, isFirstPoll, error: discoveryError } = useGraffitiDiscover(
      () => session.value !== undefined ? ["site:" + siteName] : [],
      () => ({ anyOf: [
        versionSchema(siteName, publishers.value),
        versionFollowSchema(session.value?.actor ?? ""),
      ] }) as const,
      () => session.value,
    );

    const versions = computed(() => newestFirst(objects.value.filter(isSiteVersion)));
    const myVersion = computed(() => versions.value.find((version) =>
      version.actor === session.value?.actor,
    ));
    const adminVersion = computed(() => versions.value.find((version) =>
      admins.includes(version.actor),
    ));
    const previewVersionUrl = ref<string | null>(null);
    const versionError = ref("");
    watch(session, () => {
      previewVersionUrl.value = null;
      versionError.value = "";
    });
    const isFollowingAdminVersions = computed(() => followsOwnVersion(
      objects.value, myVersion.value?.url,
    ));
    const newerAdminVersion = computed(() => !!myVersion.value && !!adminVersion.value &&
      versions.value.indexOf(adminVersion.value) < versions.value.indexOf(myVersion.value),
    );
    const isPreviewingAdmin = computed(() => newerAdminVersion.value &&
      previewVersionUrl.value === adminVersion.value?.url);
    const viewingAdminVersion = computed(() => isPreviewingAdmin.value || isFollowingAdminVersions.value);
    const selectedVersion = computed(() => viewingAdminVersion.value && newerAdminVersion.value
      ? adminVersion.value || myVersion.value
      : myVersion.value || adminVersion.value,
    );
    const showVersionNotice = computed(() => newerAdminVersion.value && !isFollowingAdminVersions.value);
    const versionBusy = ref(false);
    function previewAdminVersion() {
      if (!showVersionNotice.value || !adminVersion.value || versionBusy.value) return;
      previewVersionUrl.value = adminVersion.value.url;
      versionError.value = "";
      closeAccountMenu();
    }
    function stopPreview() {
      previewVersionUrl.value = null;
      closeAccountMenu();
    }
    async function upgradeToAdminVersions() {
      const currentSession = session.value;
      const ownVersion = myVersion.value;
      if (!currentSession || !ownVersion || !showVersionNotice.value || versionBusy.value) return;
      versionBusy.value = true;
      versionError.value = "";
      try {
        await graffiti.post<ReturnType<typeof versionFollowSchema>>({
          allowed: [],
          channels: ["site:" + siteName],
          value: {
            action: "Follow site admin versions",
            "my version": ownVersion.url,
          },
        }, currentSession);
        if (session.value?.actor === currentSession.actor) {
          previewVersionUrl.value = null;
          closeAccountMenu();
        }
      } catch (error) {
        if (session.value?.actor === currentSession.actor) versionError.value = errorText(error);
      } finally {
        versionBusy.value = false;
      }
    }

    // Clear the old page while fetching a selection; the counter keeps a slow
    // fetch from replacing a newer selection or reporting its stale error.
    const displayed = ref<{ html: string; versionUrl: string } | null>(null);
    const mediaError = ref("");
    let load = 0;
    watch(() => selectedVersion.value?.url, async () => {
      const currentLoad = ++load;
      displayed.value = null;
      mediaError.value = "";
      document.title = title;
      const version = selectedVersion.value;
      if (!version) return;
      try {
        const media = await graffiti.getMedia(version.value.document, {
          types: ["text/html"],
        });
        const html = await media.data.text();
        if (currentLoad !== load) return;
        displayed.value = { html, versionUrl: version.url };
      } catch (error) {
        if (currentLoad === load) mediaError.value = errorText(error);
      }
    }, { immediate: true });

    const siteQuery = ref(window.query);
    function onQueryChange() { siteQuery.value = window.query; }
    window.addEventListener("querychange", onQueryChange);
    onScopeDispose(() => window.removeEventListener("querychange", onQueryChange));
    const headerVisible = computed(() => options.showHeader?.(siteQuery.value || "") ?? true);

    const siteAddress = computed(() => window.route.composeAddress(siteName, siteQuery.value));
    const editUrl = ref("");
    const editError = ref("");
    const editButton = ref<HTMLButtonElement | null>(null);
    const editDialog = ref<HTMLDialogElement | null>(null);
    function openEditDialog() {
      editUrl.value = "";
      editError.value = "";
      try {
        const params = new URLSearchParams();
        if (displayed.value &&
            displayed.value.versionUrl === selectedVersion.value?.url) {
          params.set("draft", displayed.value.html);
        }
        params.set("redirect_route", window.urlFor(siteQuery.value || "?/"));
        const address = window.route.composeAddress(
          "e", window.route.composeQuery(params, siteAddress.value),
        );
        editUrl.value = `#/${address}`;
      } catch {
        editError.value = "Could not prepare the editor link. Please try again.";
      }
      editDialog.value?.showModal();
      editDialog.value?.querySelector<HTMLElement>("#wikify-edit-title")?.focus();
    }
    function restoreFocus() { editButton.value?.focus(); }
    function closeEditDialogOnBackdrop(event: MouseEvent) {
      const dialog = editDialog.value;
      if (dialog && event.target === dialog) dialog.close();
    }

    const accountMenu = ref<HTMLDetailsElement | null>(null);
    function closeAccountMenu() {
      if (accountMenu.value) accountMenu.value.open = false;
    }
    function closeAccountMenuOnOutsideClick(event: PointerEvent) {
      if (!accountMenu.value?.contains(event.target as Node)) closeAccountMenu();
    }
    document.addEventListener("pointerdown", closeAccountMenuOnOutsideClick);
    window.addEventListener("blur", closeAccountMenu);
    watch(session, closeAccountMenu);
    onScopeDispose(() => {
      document.removeEventListener("pointerdown", closeAccountMenuOnOutsideClick);
      window.removeEventListener("blur", closeAccountMenu);
    });

    const accountBusy = ref(false);
    const accountError = ref("");
    async function openPermissions() {
      closeAccountMenu();
      accountError.value = "";
      try {
        await window.showPermissions();
      } catch (error) {
        accountError.value = errorText(error);
      }
    }
    async function changeAccount() {
      if (accountBusy.value || session.value === undefined) return;
      accountBusy.value = true;
      accountError.value = "";
      try {
        if (session.value) await graffiti.logout(session.value);
        else await graffiti.login();
      } catch (error) {
        accountError.value = errorText(error);
      } finally {
        accountBusy.value = false;
      }
    }

    function onChildMetadata(event: CustomEvent<{ title?: unknown }>) {
      if (typeof event.detail?.title !== "string") return;
      event.preventDefault();
      document.title = event.detail.title.trim() || title;
    }

    return {
      title, siteName, editingGuidelines, session, isAdmin, isFirstPoll, discoveryError,
      selectedVersion, displayed, mediaError, showVersionNotice, adminVersion,
      isPreviewingAdmin, isFollowingAdminVersions,
      versionBusy, versionError, previewAdminVersion, stopPreview, upgradeToAdminVersions,
      siteQuery, headerVisible,
      editUrl, editError, editButton, editDialog, openEditDialog,
      restoreFocus, closeEditDialogOnBackdrop, accountMenu, accountBusy,
      accountError, openPermissions, changeAccount, onChildMetadata,
    };
  }

  createApp({ template, setup })
    .use(GraffitiPlugin, { graffiti: new window.Graffiti() })
    .mount(mount);
  mounted = true;
}

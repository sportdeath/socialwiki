import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { createApp } from "vue";
import AddressBar from "./AddressBar/main";
import SettingsDialog from "./SettingsDialog/main";
import {
    computed,
    onBeforeUnmount,
    onMounted,
    onUnmounted,
    ref,
    watch,
} from "vue";
import {
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { useLensSources } from "./lens-resolver";
import { ErrorPage } from "../utils/status-pages";
import {
    applyDocumentMetadata,
    isDocumentMetadata,
} from "../../../kernel/src/bridges/document-metadata/shared";

function setup() {
    const { composeAddress, composeQuery, parseAddress, parseQuery } = window.route;

    const graffiti = useGraffiti();
    const session = useGraffitiSession();

    // The browser owns lens selection. Its resolver provides the selected View
    // lens to nested transclusions; Edit and History are loaded directly below.
    const lensSources = useLensSources(graffiti, () => session.value);
    const lensDiscoveryError = lensSources.error;
    const lensDiscoveryLoading = lensSources.isFirstPoll;
    const lensRevision = lensSources.revision;
    window.handleDocumentResolution(lensSources.resolveDocument);

    const lens = ref("");
    const lensParams = ref<URLSearchParams | undefined>(undefined);
    const siteAddress = ref<string | undefined>(undefined);
    const routeReady = ref(false);
    // The latest document produced by View or History. Any route change
    // invalidates it until the active lens reports its new output.
    const srcdoc = ref<string | null>(null);
    const showSettingsDialog = ref(false);
    const navOpen = ref(true);
    const isSmall = ref(false);
    const mq = window.matchMedia("(min-width: 700px)");
    const lensQuery = computed(() =>
        composeQuery(lensParams.value, siteAddress.value),
    );
    // A lens's query says what it displays; its route identifies the public
    // document from which descendant links resolve. Edit and History are that
    // document themselves, so their routes are `?/e` and `?/h`. View is
    // transparent to the site it renders, so its route must identify that site.
    // For example, displaying Social.Wiki?/guide gives View the route
    // ?/v?/Social.Wiki: /guide remains query state inside the rendered site.
    const lensRoute = computed(() => {
        if (lens.value !== "v") return composeQuery(undefined, lens.value);

        // Lens parameters select the rendered version and therefore remain part
        // of its public identity; only the query delegated to the site is omitted.
        const { name: siteName } = parseAddress(siteAddress.value);
        return composeQuery(
            undefined,
            composeAddress(
                lens.value,
                composeQuery(lensParams.value, siteName),
            ),
        );
    });
    const directLensSource = ref<string>();
    let directLensLoad = 0;

    watch(
        [lens, session, lensRevision],
        async ([currentLens, currentSession]) => {
            const load = ++directLensLoad;
            directLensSource.value = undefined;
            if (currentSession === undefined || currentLens === "v") return;

            if (currentLens !== "e" && currentLens !== "h") {
                directLensSource.value = ErrorPage(
                    `Unknown lens: ${currentLens || "(empty)"}`,
                );
                return;
            }

            try {
                const source = await lensSources.getSource(currentLens);
                if (load === directLensLoad) directLensSource.value = source;
            } catch (error) {
                if (load === directLensLoad) {
                    console.error(`Could not load the ${currentLens} lens`, error);
                    const name = currentLens === "e" ? "Edit" : "History";
                    directLensSource.value = ErrorPage(
                        `Could not load the ${name} lens: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
        },
        { immediate: true },
    );

    function syncNav() {
        isSmall.value = !mq.matches;
        navOpen.value = mq.matches;
    }

    function openSettingsDialog() {
        showSettingsDialog.value = true;
        isDropdownOpen.value = false;
    }

    function openPermissions() {
        isDropdownOpen.value = false;
        if (isSmall.value) navOpen.value = false;
        void window.showPermissions().catch((error: unknown) => {
            console.error("Could not open permissions", error);
        });
    }

    function closeSettingsDialog() {
        showSettingsDialog.value = false;
    }

    function applyAddress(address: string) {
        const { name, query } = parseAddress(address);
        const { params, address: nestedAddress } = parseQuery(query);

        // A bare address is a site without a lens.
        if (!query.length) {
            window.navigate(
                composeQuery(
                    undefined,
                    composeAddress(
                        "v",
                        composeQuery(undefined, name || "Social.Wiki"),
                    ),
                ),
            );
            return;
        }

        // An existing lens with no site displays the home site.
        if (!nestedAddress?.length) {
            window.navigate(
                composeQuery(
                    undefined,
                    composeAddress(
                        name || "v",
                        composeQuery(params, "Social.Wiki"),
                    ),
                ),
            );
            return;
        }

        const { name: nextSiteName } = parseAddress(nestedAddress);
        const { name: currentSiteName } = parseAddress(siteAddress.value);
        const didDocumentChange =
            name !== lens.value ||
            nextSiteName !== currentSiteName ||
            (params?.toString() ?? "") !== (lensParams.value?.toString() ?? "");
        if (didDocumentChange) {
            // A new lens, lens configuration, or site invalidates the retained
            // output. The site's own query does not: View updates that state
            // without reloading or re-emitting the same source document.
            srcdoc.value = null;
            applyDocumentMetadata({ title: "", icon: null },
                nextSiteName || "Social.Wiki");
        }

        lens.value = name;
        lensParams.value = params;
        siteAddress.value = nestedAddress;
        routeReady.value = true;
    }

    function syncAddress() {
        applyAddress(window.address ?? "");
        syncNav();
    }

    window.addEventListener("querychange", syncAddress);
    if (window.address !== undefined) syncAddress();

    const loggingIn = ref(false);
    function login() {
        loggingIn.value = true;
        graffiti.login().finally(() => {
            loggingIn.value = false;
        });
    }

    // Keep the active lens's document so Edit can start from exactly what View or
    // History is displaying. Direct lenses use srcdoc for their own source, so
    // their output must come through the lens-output contract instead.
    function onLensOutput(event: CustomEvent<unknown>) {
        if (typeof event.detail !== "object" || event.detail === null) return;
        const { status, srcdoc: output } = event.detail as Record<string, unknown>;
        if (
            typeof status !== "string" ||
            (output !== undefined && typeof output !== "string")
        ) {
            return;
        }
        srcdoc.value = output ?? null;
    }

    function onLensMetadata(event: CustomEvent<unknown>) {
        if (!isDocumentMetadata(event.detail)) return;
        event.preventDefault();
        const siteName = parseAddress(siteAddress.value).name || "Social.Wiki";
        applyDocumentMetadata(event.detail, siteName);
    }

    onBeforeUnmount(() => {
        window.removeEventListener("querychange", syncAddress);
    });

    const homeRoute = "?/v?/Social.Wiki";
    const viewRoute = computed(() =>
        composeQuery(undefined,
            composeAddress("v", composeQuery(undefined, siteAddress.value)),
        )
    );
    const editRoute = computed(() => {
        // While already editing, preserve the live draft carried by this route.
        // From View or History, seed Edit with the document that lens produced.
        const editParams =
            lens.value === "e"
                ? new URLSearchParams(lensParams.value)
                : new URLSearchParams(
                    srcdoc.value ? { draft: srcdoc.value } : undefined,
                );
        return composeQuery(undefined,
            composeAddress("e", composeQuery(editParams, siteAddress.value))
        );
    });
    const historyRoute = computed(() =>
        composeQuery(
            undefined,
            composeAddress("h", composeQuery(undefined, siteAddress.value)),
        )
    );

    const isDropdownOpen = ref(false);

    // When input is submitted, the route changes
    // Preserve the current lens when only the site's own query changes.
    function routeForInputAddress(inputAddress: string) {
        // Extract the site name from the input
        const { name: inputSiteName } = parseAddress(inputAddress);
        const { name: currentSiteName } = parseAddress(siteAddress.value);
        if (inputSiteName === currentSiteName) {
            // If the user only changed the query, keep the current lens/params
            // and just update the site address
            return composeQuery(
                undefined,
                composeAddress(
                    lens.value,
                    composeQuery(lensParams.value, inputAddress),
                ),
            );
        }

        // Otherwise, navigate to the view lens
        return composeQuery(
            undefined,
            composeAddress("v", composeQuery(undefined, inputAddress)),
        );
    }

    function navigateToInputAddress(inputAddress: string) {
        window.navigate(routeForInputAddress(inputAddress));
        blurActiveElement();
    }

    // Logic for open and closing navigation
    // mount, or route change sync the nav state
    onMounted(() => {
        syncNav();
        mq.addEventListener("change", syncNav);
    });
    onUnmounted(() => {
        mq.removeEventListener("change", syncNav);
    });

    function blurActiveElement() {
        (document.activeElement as HTMLElement | null)?.blur();
    }

    function onBackdropClick() {
        closeSettingsDialog();
        syncNav();
        blurActiveElement();
    }

    return {
        directLensSource,
        editRoute,
        historyRoute,
        homeRoute,
        isDropdownOpen,
        isSmall,
        lens,
        lensDiscoveryError,
        lensDiscoveryLoading,
        lensQuery,
        lensRevision,
        lensRoute,
        lensSources,
        loggingIn,
        login,
        navOpen,
        navigateToInputAddress,
        onBackdropClick,
        onLensOutput,
        onLensMetadata,
        openPermissions,
        openSettingsDialog,
        routeForInputAddress,
        routeReady,
        session,
        showSettingsDialog,
        siteAddress,
        srcdoc,
        viewRoute,
    };
}

createApp({
    template: "#browser-template",
    components: { AddressBar, SettingsDialog },
    setup,
}).use(GraffitiPlugin, { graffiti: new window.Graffiti() }).mount("#app");

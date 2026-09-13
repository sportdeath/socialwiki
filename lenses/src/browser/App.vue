<template>
    <header>
        <RouterLink :to="encodeRouteForRouter('')">
            <h1>
                <span class="brand-full">Social.Wiki</span>
                <span class="brand-short" aria-hidden="true">SW</span>
            </h1>
        </RouterLink>

        <AddressBar
            :address="pageAddress"
            :history-suggestions="historySuggestions"
            v-model="isDropdownOpen"
            @navigate="navigateToInputAddress"
            @search="refreshHistorySuggestions"
            @focus="isSmall && (navOpen = false)"
        />

        <details :open="navOpen">
            <summary @click.prevent="navOpen = !navOpen">Menu</summary>

            <nav>
                <ul>
                    <li>
                        <RouterLink
                            :to="
                                encodeRouteForRouter(
                                    composeAddress(
                                        'v',
                                        composeQuery(undefined, pageAddress),
                                    ),
                                )
                            "
                            title="The current version of this page"
                        >
                            View
                        </RouterLink>
                    </li>
                    <li>
                        <RouterLink
                            :to="encodeRouteForRouter(editRoute)"
                            title="Edit the source code of this page"
                        >
                            Edit
                        </RouterLink>
                    </li>
                    <li>
                        <RouterLink
                            :to="
                                encodeRouteForRouter(
                                    composeAddress(
                                        'h',
                                        composeQuery(undefined, pageAddress),
                                    ),
                                )
                            "
                            title="Past revisions of this page"
                        >
                            History
                        </RouterLink>
                    </li>
                    <li v-if="$graffitiSession.value === undefined">
                        Loading...
                    </li>
                    <li v-else-if="$graffitiSession.value === null">
                        <button @click="login" :disabled="loggingIn">
                            {{ loggingIn ? "Logging in..." : "Log In" }}
                        </button>
                    </li>
                    <li v-else>
                        <button @click="openSettingsDialog" class="secondary">
                            Settings
                        </button>
                    </li>
                </ul>
            </nav>
        </details>
        <div
            v-if="isDropdownOpen || (navOpen && isSmall)"
            class="backdrop"
            @pointerdown.prevent="onBackdropClick"
        ></div>
    </header>
    <SettingsDialog
        v-model="showSettingsDialog"
        :logged-in="!!session"
        :logging-out="loggingOut"
        @logout="session && logoutFromSettings(session)"
        @edit="openMetaLensFromSettings"
    />
    <main>
        <MetaLensEditor
            v-if="metaLens !== null"
            :lens="metaLens"
            :query="metaLensQuery"
        />
        <sw-transclude
            v-else-if="session !== undefined"
            :key="session?.actor ?? 'anonymous'"
            :id="lens"
            :name="
                lens === 'v'
                    ? 'View'
                    : lens === 'e'
                      ? 'Edit'
                      : lens === 'h'
                        ? 'History'
                        : lens
            "
            :src="`#/${composeAddress(lens, composeQuery(lensParams, pageAddress))}`"
            ref="transclude"
        ></sw-transclude>
        <h1 v-else class="status dots">Page loading</h1>
    </main>
</template>

<script setup lang="ts">
import {
    computed,
    defineAsyncComponent,
    onBeforeUnmount,
    onMounted,
    onUnmounted,
    ref,
    useTemplateRef,
    watch,
} from "vue";
import SettingsDialog from "./SettingsDialog.vue";
import AddressBar from "./AddressBar.vue";
import { useRouter } from "vue-router";
import { useGraffiti, useGraffitiSession } from "@graffiti-garden/wrapper-vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import {
    listVisitedPages,
    recordPageVisit,
    type VisitedPage,
} from "./browser-history";
import { createBrowserResolver, type Lens } from "./lens-resolver";
import {
    encodeRouteForRouter,
    extractHashRoute,
    getLegacyLensRedirect,
} from "./browser-route";

const { composeAddress, composeQuery, parseAddress, parseQuery } = window.route;
const MetaLensEditor = defineAsyncComponent(
    () => import("./MetaLensEditor.vue"),
);

function parseMetaLensRoute(
    address: string,
): { lens: Lens; query: string } | null {
    const { name, query } = parseAddress(address);
    const match = name.match(/^meta\/([veh])$/);
    if (!match) return null;
    return {
        lens: match[1] as Lens,
        query: query.startsWith("?") ? query.slice(1) : query,
    };
}

const graffiti = useGraffiti();
const session = useGraffitiSession();
const router = useRouter();

// The browser owns lens selection. Replacing the forwarding resolver here
// lets a person's Graffiti-stored lens source take precedence over the
// distribution defaults without changing the kernel or nested documents.
window.handleDocumentResolution(
    createBrowserResolver(() => session.value),
);

const props = defineProps<{
    address: string;
}>();

const lens = ref("");
const metaLens = ref<Lens | null>(null);
const metaLensQuery = ref("");
const lensParams = ref<URLSearchParams | undefined>(undefined);
const pageAddress = ref<string | undefined>(undefined);
const showSettingsDialog = ref(false);

function openSettingsDialog() {
    showSettingsDialog.value = true;
    isDropdownOpen.value = false;
}

function closeSettingsDialog() {
    showSettingsDialog.value = false;
}

function openMetaLensEditor(lens: Lens) {
    const route =
        lens === "e"
            ? editRoute.value
            : composeAddress(lens, composeQuery(undefined, pageAddress.value));
    const { query } = parseAddress(route);
    router.push(encodeRouteForRouter(composeAddress(`meta/${lens}`, query)));
}

function openMetaLensFromSettings(lens: Lens) {
    closeSettingsDialog();
    openMetaLensEditor(lens);
}

watch(
    () => props.address,
    (newAddress) => {
        // Meta routes render the browser's lens editor directly. Ordinary
        // routes are split into the lens and the page address it receives.
        const metaRoute = parseMetaLensRoute(newAddress);
        if (metaRoute) {
            metaLens.value = metaRoute.lens;
            metaLensQuery.value = metaRoute.query;
            lens.value = `meta/${metaRoute.lens}`;
            lensParams.value = undefined;
            return;
        }

        metaLens.value = null;
        metaLensQuery.value = "";
        const { name: lens_, query } = parseAddress(newAddress);
        lens.value = lens_;
        const { params: lensParams_, address: pageAddress_ } =
            parseQuery(query);
        lensParams.value = lensParams_;
        pageAddress.value = pageAddress_;

        // TODO: Remove this after the legacy route format is fully sunset.
        const legacyRedirectRoute = getLegacyLensRedirect(newAddress);
        if (legacyRedirectRoute !== null) {
            router.replace(encodeRouteForRouter(legacyRedirectRoute));
            return;
        }

        // If the route is missing a lens (e.g. "#/SomePage"), redirect
        // to the view lens while preserving the raw page address.
        if (!pageAddress.value?.length) {
            const redirectRoute = composeAddress(
                "v",
                composeQuery(lensParams.value, lens.value),
            );
            router.replace(encodeRouteForRouter(redirectRoute));
            return;
        }
    },
    { immediate: true },
);

const loggingIn = ref(false);
const loggingOut = ref(false);

function login() {
    loggingIn.value = true;
    graffiti.login().finally(() => {
        loggingIn.value = false;
    });
}
function logout(session: GraffitiSession) {
    loggingOut.value = true;
    graffiti.logout(session).finally(() => {
        loggingOut.value = false;
    });
}

function logoutFromSettings(session: GraffitiSession) {
    closeSettingsDialog();
    logout(session);
}

// Watch transclude srcdoc for draft updates and listen for explicit
// navigation events from the transclude element.
const transclude = useTemplateRef<HTMLElement>("transclude");
const srcdoc = ref<string | null>(null);
let observer: MutationObserver | undefined;
let observedTransclude: HTMLElement | null = null;

function detachObservedTransclude() {
    observer?.disconnect();
    observer = undefined;
    observedTransclude = null;
}

function onNavigate(to: string) {
    // If it is relative, add the lens
    if (to.startsWith("?")) {
        router.push(encodeRouteForRouter(composeAddress(lens.value, to)));
        return;
    }

    const baseUrl = new URL(document.baseURI);
    const internalRoute = extractHashRoute(to, baseUrl.href);
    if (internalRoute !== null) {
        router.push(encodeRouteForRouter(internalRoute));
        return;
    }

    const url = new URL(to, baseUrl).toString();
    window.navigate(url);
}
watch(
    transclude,
    (nextTransclude) => {
        detachObservedTransclude();
        if (!nextTransclude) {
            srcdoc.value = null;
            return;
        }

        observedTransclude = nextTransclude;
        observer = new MutationObserver(() => {
            srcdoc.value = observedTransclude?.getAttribute("srcdoc") ?? null;
        });
        observer.observe(observedTransclude, {
            attributes: true,
            attributeFilter: ["srcdoc"],
        });
        srcdoc.value = observedTransclude.getAttribute("srcdoc") ?? null;
    },
    { immediate: true },
);
const stopHandlingNavigation = window.handleNavigation(onNavigate);
onBeforeUnmount(() => {
    detachObservedTransclude();
    stopHandlingNavigation();
});

const editRoute = computed(() => {
    const lensParams = new URLSearchParams(
        srcdoc.value ? { draft: srcdoc.value } : undefined,
    );
    return composeAddress("e", composeQuery(lensParams, pageAddress.value));
});

const isDropdownOpen = ref(false);
const historySuggestions = ref<VisitedPage[]>([]);
let historyLookupVersion = 0;

let searchQuery = "";
async function refreshHistorySuggestions(query = searchQuery) {
    searchQuery = query;
    const lookupVersion = ++historyLookupVersion;

    try {
        const suggestions = await listVisitedPages(query);
        if (lookupVersion !== historyLookupVersion) return;
        historySuggestions.value = suggestions;
    } catch {
        if (lookupVersion !== historyLookupVersion) return;
        historySuggestions.value = [];
    }
}

watch(
    pageAddress,
    (address) => {
        if (!address) return;
        void recordPageVisit(address)
            .then(() => {
                if (!isDropdownOpen.value) return;
                void refreshHistorySuggestions();
            })
            .catch(() => {});
    },
    { immediate: true },
);

// When input is submitted, the route changes
// Preserve the current lens when only the page's own query changes.
function navigateToInputAddress(inputAddress: string) {
    if (metaLens.value !== null) {
        router.push(
            encodeRouteForRouter(
                composeAddress("v", composeQuery(undefined, inputAddress)),
            ),
        );
        blurActiveElement();
        return;
    }

    // Extract the page name from the input
    const { name: inputPageName } = parseAddress(inputAddress);
    const { name: currentPageName } = parseAddress(pageAddress.value);
    if (inputPageName === currentPageName) {
        // If the user only changed the query, keep the current lens/params
        // and just update the page address
        router.push(
            encodeRouteForRouter(
                composeAddress(
                    lens.value,
                    composeQuery(lensParams.value, inputAddress),
                ),
            ),
        );
    } else {
        // Otherwise, navigate to the view lens
        router.push(
            encodeRouteForRouter(
                composeAddress("v", composeQuery(undefined, inputAddress)),
            ),
        );
    }
    blurActiveElement();
}

// Logic for open and closing navigation
const navOpen = ref(true);
const isSmall = ref(false);
const mq = window.matchMedia("(min-width: 700px)");
const syncNav = () => {
    isSmall.value = !mq.matches;
    navOpen.value = mq.matches;
};
const stopSyncingNavAfterNavigation = router.afterEach(syncNav);
// mount, or route change sync the nav state
onMounted(() => {
    syncNav();
    mq.addEventListener("change", syncNav);
});
onUnmounted(() => {
    mq.removeEventListener("change", syncNav);
    stopSyncingNavAfterNavigation();
});

function blurActiveElement() {
    (document.activeElement as HTMLElement | null)?.blur();
}

function onBackdropClick() {
    closeSettingsDialog();
    syncNav();
    blurActiveElement();
}
</script>

<style>
/* Center the browser's loading message within its content area, not its body. */
main:has(> .status) {
    display: grid;
    place-items: center;
}

header {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-color);
    gap: 1.5rem;
    position: relative;

    h1 {
        font-size: 1.25rem;
        font-weight: 400;
    }

    nav {
        font-size: 0.9rem;
    }

    > details {
        display: contents;
    }
    > details[open]::details-content {
        display: contents;
    }
}

.brand-short {
    display: none;
}
.backdrop {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    height: calc(100dvh - 100%);
    background: #00000066;
    z-index: 1;
}

nav .router-link-exact-active {
    text-decoration: underline 2px;
    color: var(--text-color);
}
nav .router-link-exact-active:hover {
    color: var(--text-color);
}

@media (min-width: 700px) {
    header > details > summary {
        display: none;
    }
}

@media (max-width: 699px) {
    .brand-full {
        display: none;
    }

    .brand-short {
        display: inline;
    }

    header {
        display: grid;
        column-gap: 0.5rem;
        row-gap: 0;
        grid-template-columns: auto minmax(0, 1fr) auto;
        grid-template-areas:
            "title address menu"
            "nav nav nav";

        h1 {
            grid-area: title;
        }

        search {
            grid-area: address;
            min-width: 0;
        }

        > details > summary {
            text-align: right;
            user-select: none;
            grid-area: menu;
            color: var(--link-color);
            cursor: pointer;
        }

        > details > summary:hover {
            text-decoration: underline;
            color: var(--link-hover-color);
        }

        > details > nav {
            font-size: inherit;
            grid-area: nav;

            ul {
                margin-top: 0.5rem;
                flex-direction: column;
                gap: 0rem;

                li:first-child {
                    border-top-left-radius: 0.5rem;
                    border-top-right-radius: 0.5rem;
                }

                li {
                    width: 100%;
                    border: 1px solid var(--border-color);

                    a,
                    button {
                        padding: 0.5rem;
                        width: 100%;
                        text-align: center;
                        display: block;
                    }

                    :is(a, button):hover {
                        background: var(--background-color-interactive);
                    }
                }

                li + li {
                    border-top: none;
                }

                li:last-child {
                    border-bottom-left-radius: 0.5rem;
                    border-bottom-right-radius: 0.5rem;
                }
            }
        }
    }
}
</style>

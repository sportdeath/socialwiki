<template>
    <header>
        <a :href="homeRoute">
            <h1>
                <span class="brand-full">Social.Wiki</span>
                <span class="brand-short" aria-hidden="true">SW</span>
            </h1>
        </a>

        <AddressBar
            :address="pageAddress"
            :route-for-input-address="routeForInputAddress"
            v-model="isDropdownOpen"
            @navigate="navigateToInputAddress"
            @focus="isSmall && (navOpen = false)"
        />

        <details :open="navOpen">
            <summary @click.prevent="navOpen = !navOpen">Menu</summary>

            <nav>
                <ul>
                    <li v-if="routeReady">
                        <a
                            :href="viewRoute"
                            :class="{ active: lens === 'v' }"
                            :aria-current="lens === 'v' ? 'page' : undefined"
                            title="The current version of this page"
                        >
                            View
                        </a>
                    </li>
                    <li v-if="routeReady">
                        <a
                            :href="editRoute"
                            :class="{ active: lens === 'e' }"
                            :aria-current="lens === 'e' ? 'page' : undefined"
                            title="Edit the source code of this page"
                        >
                            Edit
                        </a>
                    </li>
                    <li v-if="routeReady">
                        <a
                            :href="historyRoute"
                            :class="{ active: lens === 'h' }"
                            :aria-current="lens === 'h' ? 'page' : undefined"
                            title="Past revisions of this page"
                        >
                            History
                        </a>
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
        :lens-sources="lensSources"
    />
    <main>
        <sw-transclude
            v-if="
                session !== undefined &&
                routeReady &&
                (lens === 'v' || directLensSource !== undefined)
            "
            :key="`${session?.actor ?? 'anonymous'}:${lens}:${lensRevision}`"
            :id="lens"
            permission-scope="inherit"
            :name="
                lens === 'v'
                    ? 'View'
                    : lens === 'e'
                      ? 'Edit'
                      : lens === 'h'
                        ? 'History'
                        : lens
            "
            :src="lens === 'v' ? lensQuery : undefined"
            :srcdoc="lens === 'v' ? undefined : directLensSource"
            :query="lens === 'v' ? undefined : lensQuery"
            ref="transclude"
        ></sw-transclude>
        <h1 v-else class="status dots">Page loading</h1>
    </main>
</template>

<script setup lang="ts">
import {
    computed,
    onBeforeUnmount,
    onMounted,
    onUnmounted,
    ref,
    useTemplateRef,
    watch,
} from "vue";
import SettingsDialog from "./SettingsDialog.vue";
import AddressBar from "./AddressBar.vue";
import {
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { useLensSources } from "./lens-resolver";
const { composeAddress, composeQuery, parseAddress, parseQuery } = window.route;

const graffiti = useGraffiti();
const session = useGraffitiSession();

// The browser owns lens selection. Its resolver provides the selected View
// lens to nested transclusions; Edit and History are loaded directly below.
const lensSources = useLensSources(graffiti, () => session.value);
const lensRevision = lensSources.revision;
window.handleDocumentResolution(lensSources.resolveDocument);

const lens = ref("");
const lensParams = ref<URLSearchParams | undefined>(undefined);
const pageAddress = ref<string | undefined>(undefined);
const routeReady = ref(false);
const showSettingsDialog = ref(false);
const navOpen = ref(true);
const isSmall = ref(false);
const mq = window.matchMedia("(min-width: 700px)");
const lensQuery = computed(() =>
    composeQuery(lensParams.value, pageAddress.value),
);
const directLensSource = ref<string>();
let directLensLoad = 0;

watch(
    [lens, session, lensRevision],
    async ([currentLens, currentSession]) => {
        const load = ++directLensLoad;
        directLensSource.value = undefined;
        if (
            currentSession === undefined ||
            (currentLens !== "e" && currentLens !== "h")
        ) {
            return;
        }

        try {
            const source = await lensSources.getSource(currentLens);
            if (load === directLensLoad) directLensSource.value = source;
        } catch (error) {
            if (load === directLensLoad) {
                console.error(`Could not load the ${currentLens} lens`, error);
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

function closeSettingsDialog() {
    showSettingsDialog.value = false;
}

function applyAddress(address: string) {
    const { name, query } = parseAddress(address);
    const { params, address: nestedAddress } = parseQuery(query);

    // A bare address is a page without a lens.
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

    // An existing lens with no page displays the home page.
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

    lens.value = name;
    lensParams.value = params;
    pageAddress.value = nestedAddress;
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
        window.navigate(
          composeQuery(
            undefined,
            composeAddress(lens.value, to)
          )
        )
        return;
    }

    window.navigate(to);
}
watch(
    transclude,
    (nextTransclude) => {
        detachObservedTransclude();
        // Only a resolved View transclusion reflects the displayed page into
        // srcdoc. Direct Edit/History srcdoc is the lens source itself.
        if (!nextTransclude?.hasAttribute("src")) {
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
    window.removeEventListener("querychange", syncAddress);
});

const homeRoute = "?/v?/Social.Wiki";
const viewRoute = computed(() =>
    composeQuery(undefined,
      composeAddress("v", composeQuery(undefined, pageAddress.value)),
    )
);
const editRoute = computed(() => {
    const lensParams = new URLSearchParams(
        srcdoc.value ? { draft: srcdoc.value } : undefined,
    );
    return composeQuery(undefined,
      composeAddress("e", composeQuery(lensParams, pageAddress.value))
    );
});
const historyRoute = computed(() =>
    composeQuery(
      undefined,
      composeAddress("h", composeQuery(undefined, pageAddress.value)),
    )
);

const isDropdownOpen = ref(false);

// When input is submitted, the route changes
// Preserve the current lens when only the page's own query changes.
function routeForInputAddress(inputAddress: string) {
    // Extract the page name from the input
    const { name: inputPageName } = parseAddress(inputAddress);
    const { name: currentPageName } = parseAddress(pageAddress.value);
    if (inputPageName === currentPageName) {
        // If the user only changed the query, keep the current lens/params
        // and just update the page address
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

nav a.active {
    text-decoration: underline 2px;
    color: var(--text-color);
}
nav a.active:hover {
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

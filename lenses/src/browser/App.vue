<template>
    <header>
        <a :href="homeRoute">
            <h1>
                <span class="brand-full">Social.Wiki</span>
                <span class="brand-short" aria-hidden="true">SW</span>
            </h1>
        </a>

        <AddressBar
            :address="siteAddress"
            :route-for-input-address="routeForInputAddress"
            v-model="isDropdownOpen"
            @navigate="navigateToInputAddress"
            @focus="isSmall && (navOpen = false)"
        >
            <template #actions>
                <button
                    type="button"
                    class="guard-permissions"
                    title="Show permissions"
                    aria-label="Show permissions"
                    @click="openPeripheralPermissions"
                >
                    <span class="permissions-shield-icon" aria-hidden="true"></span>
                    <span class="permissions-full">Permissions</span>
                </button>
            </template>
        </AddressBar>

        <details :open="navOpen">
            <summary @click.prevent="navOpen = !navOpen">Menu</summary>

            <nav>
                <ul>
                    <li v-if="routeReady">
                        <a
                            :href="viewRoute"
                            :class="{ active: lens === 'v' }"
                            :aria-current="lens === 'v' ? 'page' : undefined"
                            title="The current version of this site"
                        >
                            View
                        </a>
                    </li>
                    <li v-if="routeReady">
                        <a
                            :href="editRoute"
                            :class="{ active: lens === 'e' }"
                            :aria-current="lens === 'e' ? 'page' : undefined"
                            title="Edit the source code of this site"
                        >
                            Edit
                        </a>
                    </li>
                    <li v-if="routeReady">
                        <a
                            :href="historyRoute"
                            :class="{ active: lens === 'h' }"
                            :aria-current="lens === 'h' ? 'page' : undefined"
                            title="Past revisions of this site"
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
            :route="lensRoute"
            :src="lens === 'v' ? lensQuery : undefined"
            :srcdoc="lens === 'v' ? undefined : directLensSource"
            :query="lens === 'v' ? undefined : lensQuery"
            @sw-lens-output="onLensOutput"
        ></sw-transclude>
        <h1 v-else class="status dots">Site loading</h1>
    </main>
</template>

<script setup lang="ts">
import {
    computed,
    onBeforeUnmount,
    onMounted,
    onUnmounted,
    ref,
    watch,
} from "vue";
import SettingsDialog from "./SettingsDialog.vue";
import AddressBar from "./AddressBar.vue";
import {
    useGraffiti,
    useGraffitiSession,
} from "@graffiti-garden/wrapper-vue";
import { useLensSources } from "./lens-resolver";
import { ErrorPage } from "../utils/status-pages";
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

function openPeripheralPermissions() {
    isDropdownOpen.value = false;
    if (isSmall.value) navOpen.value = false;
    void window.showPeripheralPermissions().catch((error: unknown) => {
        console.error("Could not open peripheral permissions", error);
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
    if (
        name !== lens.value ||
        nextSiteName !== currentSiteName ||
        (params?.toString() ?? "") !== (lensParams.value?.toString() ?? "")
    ) {
        // A new lens, lens configuration, or site invalidates the retained
        // output. The site's own query does not: View updates that state
        // without reloading or re-emitting the same source document.
        srcdoc.value = null;
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

.guard-permissions {
    flex: 0 0 auto;
    align-self: stretch;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.5rem;
    border: none;
    border-left: 1px solid var(--border-color);
    border-radius: 0 0.5rem 0.5rem 0;
    font: inherit;
    line-height: 1;
    cursor: pointer;
    color: var(--secondary-color);
    background: var(--background-color-interactive);
}
.guard-permissions:hover {
    color: var(--secondary-hover-color);
    background: var(--background-color-interactive-hover);
    text-decoration: none;
}
.permissions-shield-icon {
    display: inline-block;
    width: 1rem;
    height: 1rem;
    background-color: currentColor;
    mask: url("./permissions-shield.svg") center / contain no-repeat;
    -webkit-mask: url("./permissions-shield.svg") center / contain no-repeat;
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
    .permissions-full {
        display: none;
    }
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

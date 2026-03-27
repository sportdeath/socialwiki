<template>
    <GraffitiGuardPrompt />
    <header>
        <RouterLink :to="encodeRouteForRouter('')">
            <h1>
                <span class="brand-full">Social.Wiki</span>
                <span class="brand-short" aria-hidden="true">SW</span>
            </h1>
        </RouterLink>

        <form
            @submit.prevent="submitForm"
            @focusin="onAddressFocusIn"
            ref="address-form"
            @focusout="onAddressLeave"
        >
            <input
                ref="address-input"
                type="text"
                v-model="addressInput"
                placeholder="Enter page name"
                @focus="isGuardPermissionsOpen = false"
                @mousedown="selectAddress"
                @keydown="onAddressInputKeydown"
                @focusout="addressFocused = false"
                @dragstart.prevent
            />
            <details
                v-if="showGuardPermissionsButton"
                class="guard-permissions"
                :open="isGuardPermissionsOpen"
            >
                <summary
                    @click.prevent="
                        isGuardPermissionsOpen = !isGuardPermissionsOpen;
                        isDropdownOpen = false;
                    "
                    title="Show app permissions"
                >
                    <span class="permissions-shield-icon"></span>
                    <span class="permissions-full">Permissions</span>
                </summary>
                <GraffitiGuardPermissionsPanel v-if="isGuardPermissionsOpen" />
            </details>
            <ul
                ref="address-dropdown"
                class="dropdown"
                v-if="
                    isDropdownOpen &&
                    (addressInput !== pageAddress || historySuggestions.length)
                "
                @keydown="onDropdownKeydown"
            >
                <li v-if="addressInput !== pageAddress">
                    <RouterLink
                        :to="
                            encodeRouteForRouter(
                                composeAddress(
                                    lens,
                                    composeQuery(lensParams, pageAddress),
                                ),
                            )
                        "
                        @click="
                            addressInput = pageAddress;
                            isDropdownOpen = false;
                        "
                        v-if="addressInput !== pageAddress"
                    >
                        Current page: {{ pageAddress }}
                    </RouterLink>
                </li>
                <li
                    v-for="suggestion in historySuggestions"
                    :key="suggestion.address"
                >
                    <button
                        type="button"
                        @click="navigateToVisitedPage(suggestion.address)"
                    >
                        <span>{{ suggestion.address }}</span>
                        <small>
                            {{ suggestion.visits }}
                            {{ suggestion.visits === 1 ? "visit" : "visits" }}
                        </small>
                    </button>
                </li>
            </ul>
        </form>

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
                            @pointerdown="onLensLinkPressStart($event, 'v')"
                            @pointerup="onLensLinkPointerUp('v')"
                            @pointerleave="onLensLinkPressCancel"
                            @pointercancel="onLensLinkPressCancel"
                            @click.capture="onLensLinkClick($event, 'v')"
                        >
                            View
                        </RouterLink>
                    </li>
                    <li>
                        <RouterLink
                            :to="encodeRouteForRouter(editRoute)"
                            title="Edit the source code of this page"
                            @pointerdown="onLensLinkPressStart($event, 'e')"
                            @pointerup="onLensLinkPointerUp('e')"
                            @pointerleave="onLensLinkPressCancel"
                            @pointercancel="onLensLinkPressCancel"
                            @click.capture="onLensLinkClick($event, 'e')"
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
                            @pointerdown="onLensLinkPressStart($event, 'h')"
                            @pointerup="onLensLinkPointerUp('h')"
                            @pointerleave="onLensLinkPressCancel"
                            @pointercancel="onLensLinkPressCancel"
                            @click.capture="onLensLinkClick($event, 'h')"
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
                        <button
                            :class="{ selected: loggingOut }"
                            @click="logout($graffitiSession.value)"
                            class="secondary"
                        >
                            {{ loggingOut ? "Logging out..." : "Log Out" }}
                        </button>
                    </li>
                </ul>
            </nav>
        </details>
        <div
            v-if="
                isDropdownOpen || isGuardPermissionsOpen || (navOpen && isSmall)
            "
            class="backdrop"
            @pointerdown.prevent="onBackdropClick"
        ></div>
    </header>
    <main>
        <MetaLensEditor
            v-if="metaLens !== null"
            :lens="metaLens"
            :query="metaLensQuery"
        />
        <sw-transclude
            v-else
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
    </main>
</template>

<script setup lang="ts">
import {
    computed,
    inject,
    onBeforeUnmount,
    onMounted,
    onUnmounted,
    useTemplateRef,
} from "vue";
import { ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useGraffiti } from "@graffiti-garden/wrapper-vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import {
    composeAddress,
    composeQuery,
    parseAddress,
    parseQuery,
} from "./backend/route";
import { getTranscludeId } from "./backend/transclude-ids";
import GraffitiGuardPrompt from "./guard/GraffitiGuardPrompt.vue";
import GraffitiGuardPermissionsPanel from "./guard/GraffitiGuardPermissionsPanel.vue";
import { listGraffitiGuardApprovalRules } from "./guard/graffiti-guard-approval-rules";
import {
    listVisitedPages,
    recordPageVisit,
    type VisitedPage,
} from "./browser-history";
import MetaLensEditor from "./lenses/meta/MetaLensEditor.vue";

function encodeNameForRoute(name: string): string {
    // Keep path separators readable in names while encoding other reserved chars.
    return encodeURIComponent(name).replace(/%2F/gi, "/");
}

function encodeAddressForRoute(address?: string): string {
    if (address === undefined) return "";

    const { name, query } = parseAddress(address);
    const encodedName = encodeNameForRoute(name);
    if (!query.length) return composeAddress(encodedName, query);

    const { params, address: nestedAddress } = parseQuery(query);
    const encodedNestedAddress =
        nestedAddress === undefined
            ? undefined
            : encodeAddressForRoute(nestedAddress);
    return composeAddress(
        encodedName,
        composeQuery(params, encodedNestedAddress),
    );
}

function encodeRouteForRouter(route: string): string {
    return `/${encodeAddressForRoute(route)}`;
}

function extractHashRoute(source: string, origin: string): string | null {
    if (source.startsWith("#/")) return source.slice(2);
    if (source.startsWith("/#/")) return source.slice(3);
    if (source.startsWith(`${origin}/#/`))
        return source.slice(origin.length + 3);
    return null;
}

function getLegacyLensRedirect(address: string): string | null {
    const lenses = ["v", "h", "e"];

    for (const lens of lenses) {
        const slashPrefix = `${lens}/`;
        if (address.startsWith(slashPrefix)) {
            const pageAddress = address.slice(slashPrefix.length);
            return composeAddress(lens, composeQuery(undefined, pageAddress));
        }

        const hashPrefix = `${lens}#/`;
        if (address.startsWith(hashPrefix)) {
            const pageAddress = address.slice(hashPrefix.length);
            return composeAddress(lens, composeQuery(undefined, pageAddress));
        }
    }

    return null;
}

type EditableLens = "v" | "e" | "h";

function parseMetaLensRoute(
    address: string,
): { lens: EditableLens; query: string } | null {
    const { name, query } = parseAddress(address);
    const match = name.match(/^meta\/([veh])$/);
    if (!match) return null;
    return {
        lens: match[1] as EditableLens,
        query: query.startsWith("?") ? query.slice(1) : query,
    };
}

const graffiti = useGraffiti();
const router = useRouter();

const props = defineProps<{
    address: string;
}>();

const lens = ref("");
const metaLens = ref<EditableLens | null>(null);
const metaLensQuery = ref("");
const lensParams = ref<URLSearchParams | undefined>(undefined);
const pageAddress = ref<string | undefined>(undefined);

const LENS_EDITOR_LONG_PRESS_MS = 600;
let lensPressTimer: number | undefined;
let pressedLens: EditableLens | null = null;
let longPressedLens: EditableLens | null = null;
let consumedLensClick: EditableLens | null = null;

function clearLensPressTimer() {
    if (lensPressTimer === undefined) return;
    clearTimeout(lensPressTimer);
    lensPressTimer = undefined;
}

function lensDisplayName(lens: EditableLens): string {
    return lens === "v" ? "View" : lens === "e" ? "Edit" : "History";
}

function openMetaLensEditor(lens: EditableLens) {
    const proceed = window.confirm(
        `You are about to edit the "${lensDisplayName(
            lens,
        )}" functionality. Continue?`,
    );
    if (!proceed) return;
    const shortHoldRoute =
        lens === "e"
            ? editRoute.value
            : composeAddress(lens, composeQuery(undefined, pageAddress.value));
    const { query } = parseAddress(shortHoldRoute);
    router.push(
        encodeRouteForRouter(composeAddress(`meta/${lens}`, query)),
    );
}

function onLensLinkPressStart(event: PointerEvent, lens: EditableLens) {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    clearLensPressTimer();
    consumedLensClick = null;
    pressedLens = lens;
    longPressedLens = null;
    lensPressTimer = window.setTimeout(() => {
        lensPressTimer = undefined;
        if (pressedLens !== lens) return;
        // Mark as long-press. We defer opening confirm until pointerup so the
        // initial press/release doesn't interfere with dialog interaction.
        longPressedLens = lens;
        consumedLensClick = lens;
    }, LENS_EDITOR_LONG_PRESS_MS);
}

function onLensLinkPointerUp(lens: EditableLens) {
    const shouldOpenMetaEditor =
        pressedLens === lens && longPressedLens === lens;
    pressedLens = null;
    clearLensPressTimer();
    longPressedLens = null;
    if (shouldOpenMetaEditor) {
        openMetaLensEditor(lens);
    }
}

function onLensLinkPressCancel() {
    pressedLens = null;
    longPressedLens = null;
    clearLensPressTimer();
}

function onLensLinkClick(event: MouseEvent, lens: EditableLens) {
    if (consumedLensClick !== lens) return;
    consumedLensClick = null;
    event.preventDefault();
    event.stopPropagation();
}

watch(
    () => props.address,
    (newAddress) => {
        const metaRouteLens = parseMetaLensRoute(newAddress);
        if (metaRouteLens !== null) {
            metaLens.value = metaRouteLens.lens;
            metaLensQuery.value = metaRouteLens.query;
            lens.value = `meta/${metaRouteLens.lens}`;
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

// Watch transclude srcdoc for draft updates and listen for explicit
// navigation events from the transclude element.
const transclude = useTemplateRef<HTMLElement>("transclude");
const srcdoc = ref<string | null>(null);
let observer: MutationObserver | undefined;
let observedTransclude: HTMLElement | null = null;

function detachObservedTransclude() {
    observer?.disconnect();
    observer = undefined;
    observedTransclude?.removeEventListener("sw-navigate", onTranscludeNavigate);
    observedTransclude = null;
}

function onTranscludeNavigate(e: Event) {
    if (!(e instanceof CustomEvent) || typeof e.detail?.to !== "string") return;

    // If it is relative, add the lens
    const to = e.detail.to;
    if (to.startsWith("?")) {
        router.push(encodeRouteForRouter(composeAddress(lens.value, to)));
        return;
    }

    const internalRoute = extractHashRoute(e.detail.to, window.origin);
    if (internalRoute !== null) {
        router.push(encodeRouteForRouter(internalRoute));
        return;
    }

    const url = new URL(e.detail.to, window.origin).toString();
    window.location.href = url;
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
        observedTransclude.addEventListener("sw-navigate", onTranscludeNavigate);
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
onBeforeUnmount(() => {
    detachObservedTransclude();
    clearLensPressTimer();
});

const editRoute = computed(() => {
    const lensParams = new URLSearchParams(
        srcdoc.value ? { draft: srcdoc.value } : undefined,
    );
    return composeAddress("e", composeQuery(lensParams, pageAddress.value));
});

// Partially couple the input address to the route address
// When the route changes, the input changes
const addressInput = ref(pageAddress.value);
watch(pageAddress, (newVal) => (addressInput.value = newVal), {
    immediate: true,
});

const historySuggestions = ref<VisitedPage[]>([]);
let historyLookupVersion = 0;

async function refreshHistorySuggestions() {
    const lookupVersion = ++historyLookupVersion;

    try {
        const suggestions = await listVisitedPages(addressInput.value ?? "");
        if (lookupVersion !== historyLookupVersion) return;
        historySuggestions.value = suggestions;
    } catch {
        if (lookupVersion !== historyLookupVersion) return;
        historySuggestions.value = [];
    }
}

function navigateToVisitedPage(address: string) {
    addressInput.value = address;
    isDropdownOpen.value = false;
    submitForm();
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

const isGuardPermissionsOpen = ref(false);
const showGuardPermissionsButton = ref(false);
const listConnectedWindows =
    (inject("listConnectedWindows") as
        | (() => IterableIterator<Window>)
        | null) ?? null;
let guardPermissionsVisibilityTimer: number | undefined;

async function syncGuardPermissionsButtonVisibility() {
    if (!listConnectedWindows) {
        showGuardPermissionsButton.value = false;
        isGuardPermissionsOpen.value = false;
        return;
    }

    const connectedTranscludeIds = new Set(
        [...listConnectedWindows()]
            .map((window) => getTranscludeId(window))
            .filter((id): id is string => id != null),
    );
    if (connectedTranscludeIds.size === 0) {
        showGuardPermissionsButton.value = false;
        isGuardPermissionsOpen.value = false;
        return;
    }

    const rules = await listGraffitiGuardApprovalRules();
    const hasPermissions = rules.some(
        (rule) =>
            rule.scope === "all" &&
            rule.transcludeId != null &&
            connectedTranscludeIds.has(rule.transcludeId),
    );
    showGuardPermissionsButton.value = hasPermissions;
    if (!hasPermissions) {
        isGuardPermissionsOpen.value = false;
    }
}

// When input is submitted, the route changes
function submitForm() {
    const normalizedInputAddress =
        addressInput.value && addressInput.value.length > 0
            ? addressInput.value
            : "Social.Wiki";

    if (metaLens.value !== null) {
        router.push(
            encodeRouteForRouter(
                composeAddress("v", composeQuery(undefined, normalizedInputAddress)),
            ),
        );
        (document.activeElement as HTMLElement | null)?.blur();
        return;
    }

    // Extract the page name from the input
    const { name: inputPageName } = parseAddress(normalizedInputAddress);
    const { name: currentPageName } = parseAddress(pageAddress.value);
    if (inputPageName === currentPageName) {
        // If the user only changed the query, keep the current lens/params
        // and just update the page address
        router.push(
            encodeRouteForRouter(
                composeAddress(
                    lens.value,
                    composeQuery(lensParams.value, normalizedInputAddress),
                ),
            ),
        );
    } else {
        // Otherwise, navigate to the view lens
        router.push(
            encodeRouteForRouter(
                composeAddress(
                    "v",
                    composeQuery(undefined, normalizedInputAddress),
                ),
            ),
        );
    }
    (document.activeElement as HTMLElement | null)?.blur();
}

const isDropdownOpen = ref(false);
watch(addressInput, () => {
    if (!isDropdownOpen.value) return;
    void refreshHistorySuggestions();
});
watch(isDropdownOpen, (open) => {
    if (!open) return;
    void refreshHistorySuggestions();
});

function onAddressFocusIn(event: FocusEvent) {
    if (isSmall.value) {
        navOpen.value = false;
    }

    if (
        event.target instanceof HTMLInputElement &&
        event.target.type === "text"
    ) {
        isDropdownOpen.value = true;
    }
}
const addressForm = useTemplateRef("address-form");
function onAddressLeave(event: FocusEvent) {
    const formEl = addressForm.value;
    const nextFocusedEl = event.relatedTarget;
    if (
        !formEl ||
        !(nextFocusedEl instanceof Node && formEl.contains(nextFocusedEl))
    ) {
        isDropdownOpen.value = false;
        isGuardPermissionsOpen.value = false;
    }
}

const addressInputEl = useTemplateRef<HTMLInputElement>("address-input");
const addressDropdownEl = useTemplateRef<HTMLUListElement>("address-dropdown");

function listDropdownOptions() {
    const dropdown = addressDropdownEl.value;
    if (!dropdown) return [] as HTMLElement[];

    return Array.from(dropdown.querySelectorAll<HTMLElement>("a, button"));
}

function exitAddressBar() {
    isDropdownOpen.value = false;
    isGuardPermissionsOpen.value = false;
    (document.activeElement as HTMLElement | null)?.blur();
}

function onAddressInputKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
        event.preventDefault();
        exitAddressBar();
        return;
    }

    if (!isDropdownOpen.value) return;

    const options = listDropdownOptions();
    if (options.length === 0) return;

    if (event.key === "ArrowDown") {
        event.preventDefault();
        options[0].focus();
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        options[options.length - 1].focus();
    }
}

function onDropdownKeydown(event: KeyboardEvent) {
    if (!(event.target instanceof HTMLElement)) return;

    const option = event.target.closest("a, button");
    if (!(option instanceof HTMLElement)) return;

    const options = listDropdownOptions();
    const currentIndex = options.indexOf(option);
    if (currentIndex === -1) return;

    if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % options.length;
        options[nextIndex].focus();
        return;
    }

    if (event.key === "ArrowUp") {
        event.preventDefault();
        if (currentIndex === 0) {
            addressInputEl.value?.focus();
            return;
        }
        options[currentIndex - 1].focus();
        return;
    }

    if (event.key === "Escape") {
        event.preventDefault();
        exitAddressBar();
    }
}

// Logic for open and closing navigation
const navOpen = ref(true);
const isSmall = ref(false);
const mq = window.matchMedia("(min-width: 700px)");
const syncNav = () => {
    isSmall.value = !mq.matches;
    navOpen.value = mq.matches;
};
// mount, or route change sync the nav state
onMounted(() => {
    syncNav();
    mq.addEventListener("change", syncNav);
    void syncGuardPermissionsButtonVisibility();
    guardPermissionsVisibilityTimer = window.setInterval(() => {
        void syncGuardPermissionsButtonVisibility();
    }, 250);
});
onUnmounted(() => {
    mq.removeEventListener("change", syncNav);
    if (guardPermissionsVisibilityTimer !== undefined) {
        clearInterval(guardPermissionsVisibilityTimer);
    }
});
router.afterEach(syncNav);

let addressFocused = false;
function selectAddress(event: MouseEvent) {
    // If the user is already interacting with the address bar,
    // do not interfere with native browser selection
    if (addressFocused) return;
    addressFocused = true;

    const input = event.target as HTMLInputElement;

    // If there is an existing selection, remove it.
    // This allows the creation of a new selection
    if (input.selectionStart !== null && input.selectionEnd !== null) {
        if (input.selectionStart !== input.selectionEnd) {
            input.setSelectionRange(input.selectionEnd, input.selectionEnd);
        }
    }

    // If no movement occurs, select the entire address
    let moved = false;
    const onMouseMove = () => {
        moved = true;
    };
    const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (!moved) {
            input.select();
        }
    };
    document.addEventListener("mousemove", onMouseMove, { once: true });
    document.addEventListener("mouseup", onMouseUp, { once: true });
}

function onBackdropClick() {
    isGuardPermissionsOpen.value = false;
    syncNav();
    (document.activeElement as HTMLElement | null)?.blur();
}
</script>

<style>
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

    form:has(.dropdown) {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }

    form:hover:not(:has(input[type="text"]:disabled)):not(:has(.dropdown)):not(
            :has(.guard-permissions:hover)
        ) {
        background: var(--background-color-interactive-hover);
    }

    form {
        flex: 1;
        min-width: 0;
        position: relative;
        display: flex;
        align-items: center;
        border-radius: 0.5rem;
        background: var(--background-color-interactive);

        input[type="text"] {
            background: transparent;
            width: auto;
            flex: 1 1 auto;
            min-width: 0;
            border: none;
            padding: 0.5rem;
            line-height: 1;
            outline: none;
        }

        .guard-permissions {
            flex: 0 0 auto;
            position: relative;
            align-self: stretch;

            summary {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 0.35rem;
                height: 100%;
                list-style: none;
                cursor: pointer;
                user-select: none;
                color: var(--secondary-color);
                background: var(--background-color-interactive);
                padding: 0.5rem;
                line-height: 1;
                border-left: 1px solid var(--border-color);
                border-top-right-radius: 0.5rem;
                border-bottom-right-radius: 0.5rem;
            }

            .permissions-shield-icon {
                display: inline-block;
                width: 1rem;
                height: 1rem;
                color: inherit;
                background-color: currentColor;
                -webkit-mask: url("./assets/permissions-shield.svg") center /
                    contain no-repeat;
                mask: url("./assets/permissions-shield.svg") center / contain
                    no-repeat;
            }

            summary::marker {
                content: "";
            }

            summary:hover {
                color: var(--secondary-hover-color);
                background: var(--background-color-interactive-hover);
            }
        }

        .dropdown {
            position: absolute;
            top: 100%; /* flush, no gap */
            left: 0;
            right: 0;
            margin: 0;
            list-style: none;
            background: var(--background-color-interactive);
            border-top: 1px solid var(--border-color);
            border-bottom-left-radius: 0.5rem;
            border-bottom-right-radius: 0.5rem;
            display: flex;
            flex-direction: column;
            padding: 0.2rem;
            gap: 0.2rem;

            z-index: 10;

            :is(a, button) {
                display: block;
                width: 100%;
                padding: 0.3rem;
                border-radius: 0.3rem;
                color: inherit;
                border: none;
                background: transparent;
                text-align: left;
                font: inherit;
                cursor: pointer;
            }

            button {
                display: grid;
                grid-template-columns: minmax(0, 1fr) auto;
                align-items: baseline;
                gap: 0.5rem;
            }

            button > span {
                min-width: 0;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            small {
                color: var(--secondary-color);
            }

            :is(a, button):hover {
                background: var(--background-color-interactive-hover);
                text-decoration: none;
            }

            :is(a, button):focus-visible {
                background: var(--background-color-interactive-hover);
                outline: 1px solid var(--border-color);
            }
        }
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

        form {
            grid-area: address;
            min-width: 0;
        }

        form .guard-permissions {
            .permissions-full {
                display: none;
            }
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

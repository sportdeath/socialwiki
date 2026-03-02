<template>
    <GraffitiGuardPrompt />
    <header>
        <RouterLink :to="{ name: 'home' }">
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
                type="text"
                v-model="addressInput"
                placeholder="Enter page name"
                @focus="isGuardPermissionsOpen = false"
                @mousedown="selectAddress"
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
                class="dropdown"
                v-if="isDropdownOpen && addressInput !== pageAddress"
            >
                <li>
                    <RouterLink
                        :to="composeRoute({ lens, lensParams, pageAddress })"
                        @click="
                            addressInput = pageAddress;
                            isDropdownOpen = false;
                        "
                        v-if="addressInput !== pageAddress"
                    >
                        Current page: {{ pageAddress }}
                    </RouterLink>
                </li>
            </ul>
        </form>

        <details :open="navOpen">
            <summary @click.prevent="navOpen = !navOpen">Menu</summary>

            <nav>
                <ul>
                    <li>
                        <RouterLink
                            :to="`/v/${pageAddress}`"
                            title="The current version of this page"
                        >
                            View
                        </RouterLink>
                    </li>
                    <li>
                        <RouterLink
                            :to="editAddress"
                            title="Edit the source code of this page"
                        >
                            Edit
                        </RouterLink>
                    </li>
                    <li>
                        <RouterLink
                            :to="`/h/${pageAddress}`"
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
        <sw-transclude
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
            :src="`#${composeRoute({ lens, lensParams, pageAddress })}`"
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
import { composeRoute, parseRoute } from "./backend/route";
import { getTranscludeId } from "./backend/transclude-ids";
import GraffitiGuardPrompt from "./guard/GraffitiGuardPrompt.vue";
import GraffitiGuardPermissionsPanel from "./guard/GraffitiGuardPermissionsPanel.vue";
import { listGraffitiGuardApprovalRules } from "./guard/graffiti-guard-approval-rules";

const graffiti = useGraffiti();
const router = useRouter();

const props = defineProps<{
    address: string;
}>();

const lens = ref("");
const lensParams = ref(new URLSearchParams());
const pageAddress = ref("");
watch(
    () => props.address,
    (newAddress) => {
        const parsed = parseRoute(newAddress);
        lens.value = parsed.lens;
        lensParams.value = parsed.lensParams;
        pageAddress.value = parsed.pageAddress;

        // If the route is missing a lens (e.g. "#/SomePage"), redirect
        // to the view lens while preserving the raw page address.
        const normalized = newAddress.replace(/^\/+/, "");
        const normalizedPageAddress = normalized.replace(/\/+$/, "");
        if (!parsed.pageAddress.length && normalizedPageAddress.length > 0) {
            const redirectRoute = composeRoute({
                lens: "v",
                lensParams: lensParams.value,
                pageAddress: normalizedPageAddress,
            });
            if (`/${normalizedPageAddress}` !== redirectRoute) {
                router.replace(redirectRoute);
            }
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
const srcdoc = ref("");
let observer: MutationObserver | undefined;
function onTranscludeNavigate(e: Event) {
    if (!(e instanceof CustomEvent) || typeof e.detail?.to !== "string") return;

    const url = new URL(e.detail.to, window.origin).toString();
    if (url.startsWith(window.origin + "/#")) {
        const route = url.slice(window.origin.length + 2);
        router.push(route.startsWith("/") ? route : "/" + route);
        return;
    }

    window.location.href = url;
}
onMounted(() => {
    if (!transclude.value) return;
    observer = new MutationObserver(() => {
        srcdoc.value = transclude.value?.getAttribute("srcdoc") ?? "";
    });
    transclude.value.addEventListener(
        "sw-transclude-navigate",
        onTranscludeNavigate,
    );
    observer.observe(transclude.value, {
        attributes: true,
        attributeFilter: ["srcdoc"],
    });
    // initialize value
    srcdoc.value = transclude.value?.getAttribute("srcdoc") ?? "";
});
onBeforeUnmount(() => {
    observer?.disconnect();
    transclude.value?.removeEventListener(
        "sw-transclude-navigate",
        onTranscludeNavigate,
    );
});

const editAddress = computed(() => {
    const lensParams = new URLSearchParams({
        draft: srcdoc.value,
    });
    return composeRoute({
        lens: "e",
        lensParams,
        pageAddress: pageAddress.value,
    });
});

// Partially couple the input address to the route address
// When the route changes, the input changes
const addressInput = ref(pageAddress.value);
watch(pageAddress, (newVal) => (addressInput.value = newVal), {
    immediate: true,
});

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
    router.push(
        composeRoute({
            lens: lens.value,
            lensParams: lensParams.value,
            pageAddress: addressInput.value,
        }),
    );
    (document.activeElement as HTMLElement | null)?.blur();
}

const isDropdownOpen = ref(false);
function onAddressFocusIn(event: FocusEvent) {
    if (isSmall.value) {
        navOpen.value = false;
    }

    isDropdownOpen.value =
        event.target instanceof HTMLInputElement &&
        event.target.type === "text";
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

            a {
                display: block;
                padding: 0.3rem;
                border-radius: 0.3rem;
                color: inherit;
            }

            a:hover {
                background: var(--background-color-interactive-hover);
                text-decoration: none;
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

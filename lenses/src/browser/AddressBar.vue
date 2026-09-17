<template>
    <search
        @focusin="onAddressFocusIn"
        ref="address-search"
        @focusout="onAddressFocusOut"
    >
        <input
            ref="address-input"
            type="text"
            v-model="addressInput"
            placeholder="Enter page name"
            @mousedown="selectAddress"
            @focus="selectAddressOnFocus"
            @keydown="onAddressInputKeydown"
            @focusout="addressFocused = false"
            @dragstart.prevent
        />
        <ul
            ref="address-dropdown"
            class="dropdown"
            v-if="
                isDropdownOpen &&
                (addressInput !== pageAddress ||
                    historySuggestions.length ||
                    historyEnabled === false)
            "
            @keydown="onDropdownKeydown"
        >
            <li v-if="addressInput !== pageAddress">
                <a
                    :href="routeForInputAddress(pageAddress || 'Social.Wiki')"
                    @click="
                        onVisitedPageClick(
                            $event,
                            pageAddress || 'Social.Wiki',
                        )
                    "
                >
                    Current page: {{ pageAddress }}
                </a>
            </li>
            <li
                v-for="suggestion in historySuggestions"
                :key="suggestion.address"
            >
                <a
                    :href="routeForInputAddress(suggestion.address)"
                    @click="onVisitedPageClick($event, suggestion.address)"
                >
                    <span>{{ suggestion.address }}</span>
                    <small>
                        {{ suggestion.visits }}
                        {{ suggestion.visits === 1 ? "visit" : "visits" }}
                    </small>
                </a>
            </li>
            <li v-if="historyEnabled === false">
                <button type="button" @click="enableBrowserHistory">
                    Enable browser history
                </button>
            </li>
        </ul>
    </search>
</template>
<script setup lang="ts">
import { computed, ref, watch, useTemplateRef, onBeforeUnmount } from "vue";
import { useBrowserHistory } from "./browser-history";
const props = defineProps<{
    address?: string;
    routeForInputAddress: (address: string) => string;
}>();
const emit = defineEmits<{
    navigate: [address: string];
    focus: [];
}>();
const pageAddress = computed(() => props.address);
// Partially couple the input address to the route address
// When the route changes, the input changes
const addressInput = ref(pageAddress.value);
watch(pageAddress, (newVal) => (addressInput.value = newVal), {
    immediate: true,
});
const {
    enabled: historyEnabled,
    suggestions: historySuggestions,
    enable: enableBrowserHistory,
} = useBrowserHistory(pageAddress, addressInput);

function onVisitedPageClick(event: MouseEvent, address: string) {
    // Leave modified clicks entirely native so new-tab/window behavior does
    // not unexpectedly alter the current address bar.
    if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
    ) {
        return;
    }

    addressInput.value = address;
    isDropdownOpen.value = false;
}

function navigateToInputAddress() {
    emit("navigate", addressInput.value || "Social.Wiki");
    exitAddressBar();
}

const isDropdownOpen = defineModel<boolean>({ required: true });

function onAddressFocusIn(event: FocusEvent) {
    emit("focus");

    if (
        event.target instanceof HTMLInputElement &&
        event.target.type === "text"
    ) {
        isDropdownOpen.value = true;
    }
}
const addressSearch = useTemplateRef("address-search");
function onAddressFocusOut(event: FocusEvent) {
    const searchEl = addressSearch.value;
    const nextFocusedEl = event.relatedTarget;
    if (
        !searchEl ||
        !(nextFocusedEl instanceof Node && searchEl.contains(nextFocusedEl))
    ) {
        isDropdownOpen.value = false;
    }
}

const addressInputEl = useTemplateRef<HTMLInputElement>("address-input");
const addressDropdownEl = useTemplateRef<HTMLUListElement>("address-dropdown");

function listDropdownOptions() {
    const dropdown = addressDropdownEl.value;
    if (!dropdown) return [];

    return Array.from(dropdown.querySelectorAll<HTMLElement>("a, button"));
}

function blurActiveElement() {
    (document.activeElement as HTMLElement | null)?.blur();
}

function exitAddressBar() {
    isDropdownOpen.value = false;
    blurActiveElement();
}

function onAddressInputKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
        event.preventDefault();
        navigateToInputAddress();
        return;
    }

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

let addressFocused = false;
let stopSelecting = () => {};
onBeforeUnmount(() => stopSelecting());

function selectAddressOnFocus(event: FocusEvent) {
    // Keyboard focus selects all too. Mousedown has already marked pointer
    // focus below, so an intentional drag is left to the browser.
    if (addressFocused) return;
    addressFocused = true;
    (event.target as HTMLInputElement).select();
}
function selectAddress(event: MouseEvent) {
    // If the user is already interacting with the address bar,
    // do not interfere with native browser selection
    if (addressFocused || event.button !== 0) return;
    addressFocused = true;
    stopSelecting();

    const input = event.target as HTMLInputElement;

    // If there is an existing selection, remove it.
    // This allows the creation of a new selection
    if (input.selectionStart !== null && input.selectionEnd !== null) {
        if (input.selectionStart !== input.selectionEnd) {
            input.setSelectionRange(input.selectionEnd, input.selectionEnd);
        }
    }

    // Ignore small pointer jitter, but preserve deliberate drag selection.
    let moved = false;
    const onMouseMove = (next: MouseEvent) => {
        moved ||= Math.hypot(next.clientX - event.clientX, next.clientY - event.clientY) > 5;
    };
    const onMouseUp = () => {
        stopSelecting();
        if (!moved) {
            input.select();
        }
    };
    stopSelecting = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp, { once: true });
}
</script>
<style scoped>
search:has(.dropdown) {
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
}

search:hover:not(:has(input[type="text"]:disabled)):not(:has(.dropdown)) {
    background: var(--background-color-interactive-hover);
}

search {
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
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: baseline;
            gap: 0.5rem;
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

        :is(a, button) > span {
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
</style>

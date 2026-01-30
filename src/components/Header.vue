<template>
    <header>
        <RouterLink :to="{ name: 'home' }">
            <h1>Social.Wiki</h1>
        </RouterLink>

        <form
            @submit.prevent="submitForm"
            @focusin="isDropdownOpen = true"
            @focusout="isDropdownOpen = false"
        >
            <input
                type="text"
                v-model="channelInput"
                placeholder="Enter page name"
                :disabled="disabled"
                @mousedown="selectPageName"
                @focusout="pageNameFocused = false"
                @dragstart.prevent
            />
            <ul class="dropdown" v-if="isDropdownOpen">
                <li>
                    <a
                        :href="`sw:${channel}`"
                        @mousedown="channelInput = channel"
                        v-if="channelInput !== channel"
                    >
                        Current page: {{ channel }}
                    </a>
                </li>
                <li>
                    <a href="sw:Social.Wiki"> Home </a>
                </li>
            </ul>
        </form>

        <nav>
            <slot></slot>
        </nav>
    </header>
</template>

<script setup lang="ts">
import { ref, toRef, watch } from "vue";
const props = withDefaults(
    defineProps<{
        channel: string;
        disabled?: boolean;
    }>(),
    {
        disabled: false,
    },
);
const channel = toRef(props, "channel");
const disabled = toRef(props, "disabled");

const emit = defineEmits(["update:channel", "update:submit-channel"]);

function submitForm() {
    emit("update:submit-channel", channelInput.value);
    (document.activeElement as HTMLElement | null)?.blur();
}

// Partially couple the input channel to the external channel
// When external changes, internal changes. When internal changes, alert external
const channelInput = ref(channel.value);
watch(channel, (newVal) => (channelInput.value = newVal), { immediate: true });
watch(channelInput, (newVal) => emit("update:channel", newVal));

const isDropdownOpen = ref(false);

let pageNameFocused = false;
function selectPageName(event: MouseEvent) {
    // If the user is already interacting with the address bar,
    // do not interfere with native browser selection
    if (pageNameFocused) return;
    pageNameFocused = true;

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
            requestAnimationFrame(() => input.select());
        }
    };
    document.addEventListener("mousemove", onMouseMove, { once: true });
    document.addEventListener("mouseup", onMouseUp, { once: true });
}
</script>

<style>
header {
    display: flex;
    align-items: center;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-color);
    gap: 2rem;

    h1 {
        font-size: 1.25rem;
        font-weight: 400;
    }

    form:has(.dropdown) {
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
    }

    form {
        flex: 1;
        position: relative;
        border-radius: 0.5rem;
        background: #eaecf0;

        input[type="text"] {
            background: transparent;
            width: 100%;
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
            background: #eaecf0;
            /*--background-color-interactive*/
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
                background: #dadde3;
                text-decoration: none;
            }
        }
    }

    nav {
        font-size: 0.9rem;
    }

    nav > ul {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        list-style: none;
    }
}
</style>

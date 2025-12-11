<template>
    <header>
        <RouterLink :to="{ name: 'home' }">
            <h1>SocialWiki</h1>
        </RouterLink>

        <!-- <button v-if="!disabled" @click="randomChannel">🎲</button> -->
        <form @submit.prevent="submitForm">
            <button
                v-if="!disabled"
                type="button"
                :disabled="channelInput === channel"
                @click="channelInput = channel"
            >
                🔄
            </button>
            <input
                type="text"
                v-model="channelInput"
                placeholder="Location"
                :disabled="disabled"
                @focus="$event.target?.select()"
            />
            <button v-if="!disabled" :disabled="channelInput === channel">
                ➡️
            </button>
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

function changeChannel(channel: string) {}
function submitForm() {
    emit("update:submit-channel", channelInput.value);
    document.activeElement?.blur();
}

// Partially couple the input channel to the external channel
// When external changes, internal changes. When internal changes, alert external
const channelInput = ref(channel.value);
watch(channel, (newVal) => (channelInput.value = newVal), { immediate: true });
watch(channelInput, (newVal) => emit("update:channel", newVal));

function randomChannel() {
    channelInput.value = crypto.randomUUID();
    emit("update:submit-channel", channelInput.value);
}
</script>

<style>
header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid var(--border-color);

    h1 {
        font-size: 1.25rem;
        font-weight: 400;
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

    button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
}
</style>

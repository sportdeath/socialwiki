<template>
    <div
        class="sw-two-panes"
        :class="{ 'is-resizing': isResizing }"
        ref="containerRef"
    >
        <section
            class="sw-two-pane"
            :class="{ 'is-active': activePane === 'left' }"
            :style="{ width: leftWidth + '%' }"
        >
            <header @click="setActive('left')">
                <h2>{{ leftTitle }}</h2>

                <div class="sw-two-pane-controls">
                    <slot name="left-controls" />
                </div>
            </header>

            <div class="sw-two-pane-body">
                <slot name="left-pane" />
            </div>
        </section>

        <div class="sw-two-pane-divider" @mousedown="startResize"></div>

        <section class="sw-two-pane" :class="{ 'is-active': activePane === 'right' }">
            <header @click="setActive('right')">
                <h2>{{ rightTitle }}</h2>

                <div class="sw-two-pane-controls">
                    <slot name="right-controls" />
                </div>
            </header>

            <div class="sw-two-pane-body">
                <slot name="right-pane" />
            </div>
        </section>
    </div>
</template>

<script setup lang="ts">
import { ref, onBeforeUnmount } from "vue";

type PaneSide = "left" | "right";

const props = defineProps<{
    leftTitle: string;
    rightTitle: string;
    initialLeftWidth?: number;
}>();

const activePane = ref<PaneSide>("left");

// Layout / drag state
const containerRef = ref<HTMLElement | null>(null);
const leftWidth = ref(props.initialLeftWidth ?? 55); // percentage
const isResizing = ref(false);

const setActive = (side: PaneSide) => {
    activePane.value = side;
};

const onResize = (event: MouseEvent) => {
    // If mouseup was missed, stop when no button is pressed
    if (event.buttons === 0) {
        stopResize();
        return;
    }
    if (!isResizing.value || !containerRef.value) return;

    const rect = containerRef.value.getBoundingClientRect();
    const percentage = ((event.clientX - rect.left) / rect.width) * 100;
    leftWidth.value = Math.min(80, Math.max(20, percentage));
};

const stopResize = () => {
    if (!isResizing.value) return;
    isResizing.value = false;
    window.removeEventListener("mousemove", onResize);
    window.removeEventListener("mouseup", stopResize);
    window.removeEventListener("mouseleave", stopResize);
};

const startResize = (event: MouseEvent) => {
    event.preventDefault();
    if (isResizing.value) return;
    isResizing.value = true;
    window.addEventListener("mousemove", onResize);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("mouseleave", stopResize);
};

onBeforeUnmount(() => {
    stopResize();
});
</script>

<style src="./TwoPaneLayout.css"></style>

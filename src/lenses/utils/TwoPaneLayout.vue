<template>
    <div class="two-panes" :class="{ resizing: isResizing }" ref="containerRef">
        <section
            class="pane"
            :class="{ active: activePane === 'left' }"
            :style="{ width: leftWidth + '%' }"
        >
            <header @click="setActive('left')">
                <h2>{{ leftTitle }}</h2>

                <div class="controls">
                    <slot name="left-controls" />
                </div>
            </header>

            <div class="body">
                <slot name="left-pane" />
            </div>
        </section>

        <div class="divider" @mousedown="startResize"></div>

        <section class="pane" :class="{ active: activePane === 'right' }">
            <header @click="setActive('right')">
                <h2>{{ rightTitle }}</h2>

                <div class="controls">
                    <slot name="right-controls" />
                </div>
            </header>

            <div class="body">
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

<style scoped>
.two-panes {
    height: 100%;
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
}

.two-panes.resizing,
.two-panes.resizing * {
    cursor: col-resize;
}

.two-panes.resizing * {
    pointer-events: none;
}

.pane {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    transition:
        flex 0.25s ease,
        max-height 0.25s ease;
}

.pane:last-of-type {
    flex: 1;
}

.pane > header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.7rem;
    padding: 0.35rem 0.6rem;
    border-bottom: 1px solid var(--border-color);
    font-size: 1rem;
    background: var(--background-color-interactive);
}

.pane > header h2 {
    margin: 0;
    font-size: inherit;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
}

.pane > .controls {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
}

.pane > .body {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow-y: auto;
}

.divider {
    width: 4px;
    cursor: col-resize;
    background: var(--border-color);
}

.divider:hover,
.resizing .divider {
    background: var(--border-color-hover);
}

/* Responsive / mobile */
@media (max-width: 768px) {
    .two-panes {
        flex-direction: column;
    }

    .divider {
        display: none;
    }

    .pane {
        width: 100% !important;
    }

    /* Active pane takes remaining height */
    .pane.active {
        flex: 1 1 auto;
        max-height: 100vh;
    }

    .pane:not(.active) > header:hover {
        background: var(--background-color-interactive-hover);
        cursor: pointer;
    }

    .pane:last-of-type:not(.active) {
        border-top: 1px solid var(--border-color);
    }

    /** Inactive collapses to its header bar */
    .pane:not(.active) {
        flex: 0 0 auto;
    }

    /* Collapse the panel (hide body) and hide the controls */
    .pane:not(.active) :is(.body, .controls) {
        display: none;
    }
}
</style>

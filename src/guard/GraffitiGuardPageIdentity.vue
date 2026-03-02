<template>
    <section class="page-identity">
        <component :is="nameTag" class="page-name">
            <span class="page-label muted">Page:</span>
            <template v-if="props.pageParts.length > 0">
                <span class="transclude-name-path">
                    <template
                        v-for="(part, partIndex) in props.pageParts"
                        :key="`${partIndex}:${part}`"
                    >
                        <span v-if="partIndex > 0" class="muted">/</span>
                        <span>{{ part }}</span>
                    </template>
                </span>
            </template>
            <template v-else>
                <span class="muted">(resolving transclude name)</span>
            </template>
        </component>
        <details
            v-if="props.transcludeId"
            class="version-details"
            :open="props.isPageVersionVisible"
            @toggle="onVersionDetailsToggle"
        >
            <summary class="version-toggle">
                {{
                    props.isPageVersionVisible
                        ? "Hide page version"
                        : "Show page version"
                }}
            </summary>
            <p class="transclude-version muted" :title="props.transcludeId">
                {{ props.transcludeId }}
            </p>
        </details>
    </section>
</template>

<script setup lang="ts">
const props = withDefaults(
    defineProps<{
        nameTag?: "p" | "h3";
        pageParts?: string[];
        transcludeId?: string;
        isPageVersionVisible?: boolean;
    }>(),
    {
        nameTag: "p",
        pageParts: () => [],
        transcludeId: undefined,
        isPageVersionVisible: false,
    },
);

const emit = defineEmits<{
    (event: "toggle-page-version"): void;
}>();

function onVersionDetailsToggle(event: Event) {
    const details = event.target as HTMLDetailsElement | null;
    if (!details) return;
    if (details.open === props.isPageVersionVisible) return;
    emit("toggle-page-version");
}
</script>

<style scoped>
.page-identity {
    display: grid;
    gap: 0.35rem;
}

.page-name {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: 0.3rem;
    flex-wrap: wrap;
    font-size: 1rem;
    line-height: 1.25;
}

.page-label {
    font-weight: 400;
}

.transclude-name-path {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.3rem;
    min-width: 0;
    font-weight: 700;
}

.transclude-name-path > span {
    word-break: break-word;
}

.transclude-version {
    margin: 0;
    margin-top: 0.2rem;
    min-width: 0;
    font-size: 0.85rem;
    line-height: 1.2;
    font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas,
        "Liberation Mono", "Courier New", monospace;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-all;
}

.version-details {
    display: grid;
    gap: 0.1rem;
}

.version-details > summary.version-toggle {
    all: unset;
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    cursor: pointer;
    user-select: none;
    color: var(--secondary-color);
    font-size: 0.85rem;
    line-height: 1.1;
}

.version-details > summary.version-toggle::before {
    content: "▸";
}

.version-details[open] > summary.version-toggle::before {
    content: "▾";
}

.version-details > summary.version-toggle:hover {
    color: var(--secondary-hover-color);
    text-decoration: underline 2px;
}

.version-details > summary.version-toggle:focus-visible {
    outline: 2px solid var(--border-color-hover);
    outline-offset: 2px;
    border-radius: 0.25rem;
}

.muted {
    color: var(--secondary-color);
}
</style>

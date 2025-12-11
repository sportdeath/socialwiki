<template>
    <ol>
        <li v-for="version in pageVersions" :key="version.url">
            <article :id="version.url">
                <header>
                    <h2>{{ version.url }}</h2>
                    <p>
                        Edited by
                        <strong>{{ version.actor }}</strong>
                    </p>
                </header>

                <p>{{ version.value.summary }}</p>

                <button @click="selectedPageVersion = version">Restore</button>
            </article>
        </li>
    </ol>
    <!-- <ul>
        <li>TODO!!</li>
        <li>Show the history of the page</li>
        <li>Restore old histories</li>
        <li>Filter by authorship (makes it "look" owned)</li>
        <li>Filter by a specific revision</li>
        <li>Filters go into the URL so they can be shared</li>
        <li>Visually show a "restored from" link</li>
        <li>Link to "duplicated from"</li>
    </ul> -->
</template>

<script lang="ts" setup>
import type { PageVersionObject } from "../graffiti/page-versions";

defineProps<{
    pageVersions: PageVersionObject[];
}>();
const selectedPageVersion = defineModel<PageVersionObject | null>(
    "selectedPageVersion",
);
</script>

<style scoped>
main {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem;
    font-family:
        system-ui,
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        sans-serif;
}

header h1 {
    margin: 0 0 0.25rem;
    font-size: 1.5rem;
}

header p {
    margin: 0 0 1.5rem;
    font-size: 0.95rem;
}

section[aria-label="Version history"] {
    margin-top: 1rem;
}

ol {
    list-style: none;
    padding: 0;
    margin: 0;
}

li + li {
    margin-top: 1rem;
}

article {
    border-left: 2px solid #ccc;
    padding-left: 1rem;
}

article header h2 {
    margin: 0;
    font-size: 1rem;
    word-break: break-all;
}

article header p {
    margin: 0.25rem 0 0.5rem;
    font-size: 0.9rem;
}

article p {
    margin: 0 0 0.5rem;
}

article small {
    font-size: 0.85rem;
}

article a {
    text-decoration: underline;
}
</style>

<template>
    <Header>
        <ul>
            <li>
                <a
                    @click="historyOpen = false"
                    :class="{ selected: !historyOpen }"
                >
                    View
                </a>
            </li>
            <li>
                <RouterLink
                    :to="{ name: 'edit', query: { existingHtml: html } }"
                    title="Edit the source code of this page"
                >
                    Edit
                </RouterLink>
            </li>
            <li>
                <button title="Create a copy of this page">Duplicate</button>
            </li>
            <li>
                <button
                    @click="historyOpen = true"
                    title="Past revisions of this page"
                    :class="{ selected: historyOpen }"
                >
                    History
                </button>
            </li>
            <li>
                <button title="Add this page to your watchlist">⭐</button>
            </li>
            <li class="personal-menu">
                <button
                    :class="{ selected: personalMenuOpen }"
                    @click="personalMenuOpen = true"
                    title="Personal menu"
                >
                    👤▼
                </button>
                <ul
                    v-if="personalMenuOpen"
                    v-click-away="() => (personalMenuOpen = false)"
                >
                    <li>
                        <a>My page</a>
                    </li>
                    <!-- Watchlist and contributions are uneditable pages -->
                    <li>
                        <a>Contributions</a>
                    </li>
                    <li>
                        <a>Watchlist</a>
                    </li>
                    <li>
                        <button>Log out</button>
                    </li>
                </ul>
            </li>
        </ul>
    </Header>
    <main>
        <DisplayPage v-if="!historyOpen" :html="html" />
        <TwoPaneLayout rightTitle="Preview" leftTitle="History" v-else>
            <template #left-pane>
                <ul>
                    <li>TODO!!</li>
                    <li>Show the history of the page</li>
                    <li>Restore old histories</li>
                    <li>Filter by authorship (makes it "look" owned)</li>
                    <li>Filter by a specific revision</li>
                    <li>Filters go into the URL so they can be shared</li>
                    <li>Visually show a "restored from" link</li>
                    <li>Link to "duplicated from"</li>
                </ul>
            </template>
            <template #right-pane>
                <DisplayPage :html="html" />
            </template>
        </TwoPaneLayout>
    </main>
</template>

<script setup lang="ts">
import { ref } from "vue";
import Header from "./Header.vue";
import DisplayPage from "./DisplayPage.vue";
import TwoPaneLayout from "./TwoPaneLayout.vue";
import html from "./starter.html?raw";
const personalMenuOpen = ref(false);
const historyOpen = ref(false);
</script>

<style>
.personal-menu {
    position: relative;
}

.personal-menu > ul {
    position: absolute;
    right: 0;
    top: calc(100%);
    text-align: right;
    z-index: 10;
    display: flex;
    list-style: none;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem;
    background: white;
    border: 1px solid var(--border-color);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

main {
    flex: 1;
}

.selected {
    text-decoration: underline 2px;
    color: var(--text-color);
}
.selected:hover {
    color: var(--text-color);
}
</style>

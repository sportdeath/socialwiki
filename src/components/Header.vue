<template>
    <header>
        <a>
            <h1>SocialWiki</h1>
        </a>

        <nav>
            <slot></slot>
        </nav>
    </header>
</template>

<script setup lang="ts"></script>

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
}
</style>

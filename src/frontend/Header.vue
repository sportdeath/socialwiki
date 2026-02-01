<template>
    <header>
        <RouterLink :to="{ name: 'home' }">
            <h1>
                <span class="brand-full">Social.Wiki</span>
                <span class="brand-short" aria-hidden="true">SW</span>
            </h1>
        </RouterLink>

        <form
            @submit.prevent="submitForm"
            @focusin="isDropdownOpen = true"
            @focusout="isDropdownOpen = false"
        >
            <input
                type="text"
                v-model="pageNameInput"
                placeholder="Enter page name"
                :disabled="disabled"
                @mousedown="selectPageName"
                @focusout="pageNameFocused = false"
                @dragstart.prevent
            />
            <ul
                class="dropdown"
                v-if="isDropdownOpen && pageNameInput !== pageName"
            >
                <li>
                    <a
                        :href="`sw:${pageName}`"
                        @mousedown="pageNameInput = pageName"
                        v-if="pageNameInput !== pageName"
                    >
                        Current page: {{ pageName }}
                    </a>
                </li>
            </ul>
        </form>

        <details :open="navOpen">
            <summary @click.prevent="navOpen = !navOpen">Menu</summary>

            <nav>
                <slot></slot>
            </nav>
        </details>
        <div
            v-if="navOpen && isSmall"
            class="backdrop"
            @pointerdown.prevent="syncNav"
        ></div>
    </header>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { ref, toRef, watch } from "vue";
import { useRouter } from "vue-router";
const props = withDefaults(
    defineProps<{
        pageName: string;
        disabled?: boolean;
    }>(),
    {
        disabled: false,
    },
);
const pageName = toRef(props, "pageName");
const disabled = toRef(props, "disabled");

const emit = defineEmits(["update:pageName"]);

// Partially couple the input page name to the external page name
// When external changes, internal changes.
const pageNameInput = ref(pageName.value);
watch(pageName, (newVal) => (pageNameInput.value = newVal), {
    immediate: true,
});
//  When internal is submitted, external changes
function submitForm() {
    emit("update:pageName", pageNameInput.value);
    (document.activeElement as HTMLElement | null)?.blur();
}

const isDropdownOpen = ref(false);

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
});
onUnmounted(() => {
    mq.removeEventListener("change", syncNav);
});
const router = useRouter();
router.afterEach(syncNav);

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
            input.select();
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

    form:not(:has(input[type="text"]:disabled)):not(:has(.dropdown)):hover {
        background: var(--background-color-interactive-hover);
    }

    form {
        flex: 1;
        position: relative;
        border-radius: 0.5rem;
        background: var(--background-color-interactive);

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

    nav > ul {
        display: flex;
        align-items: center;
        gap: 0.7rem;
        list-style: none;
    }

    details {
        display: contents;
    }
    details[open]::details-content {
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

@media (min-width: 700px) {
    summary {
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
        grid-template-columns: auto 1fr auto;
        grid-template-areas:
            "title address menu"
            "nav nav nav";

        h1 {
            grid-area: title;
        }

        form {
            grid-area: address;
        }

        details summary {
            text-align: right;
            user-select: none;
            grid-area: menu;
            color: var(--link-color);
            cursor: pointer;
        }

        details summary:hover {
            text-decoration: underline;
            color: var(--link-hover-color);
        }

        details nav {
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

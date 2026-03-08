<template>
    <section
        class="graffiti-guard-permissions-panel"
        ref="panelRoot"
        tabindex="-1"
    >
        <h2>Page permissions</h2>
        <ul>
            <li
                v-for="(page, index) in connectedPages"
                :key="`${index}:${page.key}`"
            >
                <article class="connected-page-card">
                    <GraffitiGuardPageIdentity
                        name-tag="h3"
                        :page-parts="page.parts"
                        :transclude-id="page.transcludeId"
                        :is-page-version-visible="
                            isPageVersionVisible(page.key)
                        "
                        @toggle-page-version="togglePageVersion(page.key)"
                    />

                    <section>
                        <header>
                            <h4>Granted Permissions</h4>
                            <button
                                type="button"
                                class="warning"
                                @click="clearAllPermissionsForPage(page)"
                            >
                                Revoke all
                            </button>
                        </header>
                    </section>

                    <ul>
                        <li
                            v-for="permission in page.permissions"
                            :key="permission.id"
                        >
                            <span>{{
                                describeCategory(permission.permissionCategory)
                            }}</span>
                            <button
                                type="button"
                                class="secondary"
                                @click="clearPermission(permission.id)"
                            >
                                Revoke
                            </button>
                        </li>
                    </ul>
                </article>
            </li>
        </ul>
    </section>
</template>

<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from "vue";
import { getTranscludeId, getTranscludeName } from "../backend/transclude-ids";
import {
    clearAllGraffitiGuardApprovalRulesForTranscludeId,
    clearGraffitiGuardApprovalRule,
    listGraffitiGuardApprovalRules,
    type GraffitiGuardApprovalRule,
} from "./graffiti-guard-approval-rules";
import { describeCategory } from "./graffiti-guard-permission-categories";
import GraffitiGuardPageIdentity from "./GraffitiGuardPageIdentity.vue";

type ConnectedPagePermission = GraffitiGuardApprovalRule & { id: number };

type ConnectedTranscludePage = {
    key: string;
    transcludeId?: string;
    parts?: string[];
    permissions: ConnectedPagePermission[];
};

const connectedPages = ref<ConnectedTranscludePage[]>([]);
const panelRoot = ref<HTMLElement | null>(null);
const listConnectedWindows =
    (inject("listConnectedWindows") as
        | (() => IterableIterator<Window>)
        | null) ?? null;
let refreshTimer: number | undefined;
let isRefreshing = false;
const visiblePageVersions = ref(new Set<string>());

function syncPanelViewportBounds() {
    const panel = panelRoot.value;
    if (!panel) return;
    const topOffset = Math.max(0, panel.getBoundingClientRect().top);
    panel.style.setProperty("--panel-top-offset", `${topOffset}px`);
}

function togglePageVersion(pageKey: string) {
    const next = new Set(visiblePageVersions.value);
    if (next.has(pageKey)) {
        next.delete(pageKey);
    } else {
        next.add(pageKey);
    }
    visiblePageVersions.value = next;
}

function isPageVersionVisible(pageKey: string) {
    return visiblePageVersions.value.has(pageKey);
}

async function syncConnectedPages() {
    if (isRefreshing) return;
    isRefreshing = true;
    if (!listConnectedWindows) {
        connectedPages.value = [];
        isRefreshing = false;
        return;
    }
    try {
        const allRules = await listGraffitiGuardApprovalRules();
        const rulesByTranscludeId = new Map<
            string,
            ConnectedPagePermission[]
        >();
        for (const rule of allRules) {
            if (
                rule.scope !== "all" ||
                rule.transcludeId == null ||
                rule.id == null
            ) {
                continue;
            }
            const rules = rulesByTranscludeId.get(rule.transcludeId) ?? [];
            rules.push(rule as ConnectedPagePermission);
            rulesByTranscludeId.set(rule.transcludeId, rules);
        }

        connectedPages.value = [...listConnectedWindows()]
            .map((window) => {
                const transcludeId = getTranscludeId(window);
                const permissions =
                    transcludeId == null
                        ? []
                        : (rulesByTranscludeId.get(transcludeId) ?? []);
                const namePath = getTranscludeName(window);
                if (namePath && namePath.length > 0) {
                    return {
                        key: `page:${transcludeId ?? namePath.join("\u001f")}`,
                        transcludeId: transcludeId ?? undefined,
                        parts: namePath,
                        permissions,
                    };
                }
                const fallback = transcludeId ?? "(resolving transclude name)";
                return {
                    key: `page:${fallback}`,
                    transcludeId: transcludeId ?? undefined,
                    fallback,
                    permissions,
                };
            })
            .filter((page) => page.permissions.length > 0);
    } finally {
        isRefreshing = false;
    }
}

async function clearPermission(ruleId: number) {
    await clearGraffitiGuardApprovalRule(ruleId);
    await syncConnectedPages();
}

async function clearAllPermissionsForPage(page: ConnectedTranscludePage) {
    if (!page.transcludeId) return;
    await clearAllGraffitiGuardApprovalRulesForTranscludeId(page.transcludeId);
    await syncConnectedPages();
}

onMounted(() => {
    panelRoot.value?.focus();
    syncPanelViewportBounds();
    window.addEventListener("resize", syncPanelViewportBounds);
    void syncConnectedPages();
    refreshTimer = window.setInterval(() => {
        void syncConnectedPages();
    }, 250);
});

onUnmounted(() => {
    window.removeEventListener("resize", syncPanelViewportBounds);
    if (refreshTimer !== undefined) {
        clearInterval(refreshTimer);
    }
});
</script>

<style scoped>
.graffiti-guard-permissions-panel {
    --panel-top-offset: 0px;
    position: absolute;
    top: calc(100% + 0.25rem);
    right: 0;
    z-index: 20;
    width: 24rem;
    max-width: 75dvw;
    max-height: max(10rem, calc(100dvh - var(--panel-top-offset) - 0.5rem));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0.75rem;
    border: 1px solid var(--border-color);
    border-radius: 0.5rem;
    background: var(--background-color);
    color: var(--text-color);
    box-shadow: 0 0.5rem 1.5rem rgb(0 0 0 / 0.2);

    h2 {
        font-size: 1rem;
        margin-bottom: 0.75rem;
        padding-bottom: 0.5rem;
        text-align: center;
        border-bottom: 1px solid var(--border-color);
    }

    > ul {
        list-style: none;
        display: grid;
        gap: 0.75rem;
        margin: 0;
        padding: 0;
    }

    > ul > li {
        display: block;
    }

    .connected-page-card {
        display: grid;
        gap: 0.45rem;
        padding: 0.65rem;
        border: 1px solid var(--border-color);
        border-radius: 0.5rem;
        background: var(--background-color-interactive);
    }

    .connected-page-card > section {
        margin: 0.1rem 0 0;
        padding-top: 0.45rem;
        border-top: 1px solid var(--border-color);
    }

    .connected-page-card > section > header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin: 0;
        padding: 0;
        border: 0;
        position: static;
    }

    .connected-page-card > section > header > h4 {
        margin: 0;
        font-size: 0.95rem;
        font-weight: 400;
    }

    .connected-page-card > section > header > button {
        flex-shrink: 0;
    }

    .connected-page-card > ul {
        list-style: none;
        display: grid;
        gap: 0.25rem;
        margin: 0;
        padding: 0;
    }

    .connected-page-card > ul > li {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0.45rem;
        border-radius: 0.3rem;
        background: var(--background-color);
    }

    .connected-page-card > ul > li > span {
        line-height: 1.25;
    }

    .connected-page-card > ul > li > button {
        flex-shrink: 0;
    }

    button:disabled {
        cursor: not-allowed;
        text-decoration: none;
        opacity: 0.8;
    }
}
</style>

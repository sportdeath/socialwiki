<template>
    <TwoPaneLayout leftTitle="History" rightTitle="Preview">
        <template #left-pane>
            <ol>
                <li v-for="(version, index) in pageVersions" :key="version.url">
                    <article :id="version.url">
                        <button
                            :class="{
                                selected:
                                    selectedPageVersion?.url === version.url,
                            }"
                            @click="selectedPageVersion = version"
                        >
                            <h3>
                                {{ version.value.summary }}
                            </h3>
                        </button>

                        <p>
                            <GraffitiActorToHandle :actor="version.actor" />
                            edited on
                            {{
                                new Date(
                                    version.value.published,
                                ).toLocaleString()
                            }}
                        </p>

                        <footer v-if="$graffitiSession.value">
                            <ul v-if="selectedPageVersion?.url === version.url">
                                <li
                                    v-if="$graffitiSession.value && index !== 0"
                                >
                                    <button
                                        @click="
                                            restorePageVersion(
                                                version,
                                                $graffitiSession.value,
                                            )
                                        "
                                    >
                                        Restore
                                    </button>
                                </li>
                                <li
                                    v-if="
                                        $graffitiSession.value?.actor ===
                                        version.actor
                                    "
                                >
                                    <button
                                        @click="
                                            deletePageVersion(
                                                graffiti,
                                                version,
                                                $graffitiSession.value,
                                            )
                                        "
                                    >
                                        Delete
                                    </button>
                                </li>
                            </ul>
                        </footer>
                    </article>
                </li>
            </ol>
        </template>
        <template #right-pane>
            <sw-transclude
                ref="transclude"
                :src="
                    selectedPageVersion
                        ? `#/version/${selectedPageVersion.value.result.media}`
                        : ''
                "
            ></sw-transclude>
        </template>
    </TwoPaneLayout>
</template>

<script lang="ts" setup>
import TwoPaneLayout from "../TwoPaneLayout.vue";
import type { GraffitiSession } from "@graffiti-garden/api";
import {
    createPageVersion,
    deletePageVersion,
    pageVersionSchema,
    type PageVersionObject,
} from "../../backend/page-versions";
import {
    useGraffiti,
    GraffitiActorToHandle,
    useGraffitiDiscover,
} from "@graffiti-garden/wrapper-vue";
import { computed, ref, watch } from "vue";
import { useTemplateRef } from "vue";
import { initLens } from "../../backend/lens-client";

const pageName = ref("");

initLens(async (address: string) => {
    // TODO: fix this and extract query/hash
    pageName.value = address;
});

const transclude = useTemplateRef<HTMLElement>("transclude");
defineExpose({ transclude });

const { objects: pageVersionsRaw } = useGraffitiDiscover(
    () => [pageName.value],
    () => pageVersionSchema(pageName.value),
);
const pageVersions = computed(() =>
    // TODO: make a sort function that does the topological sort
    // Also add filters...
    pageVersionsRaw.value.toSorted(
        (a, b) => b.value.published - a.value.published,
    ),
);

const graffiti = useGraffiti();

async function restorePageVersion(
    version: PageVersionObject,
    session: GraffitiSession,
) {
    const html = transclude.value?.getAttribute("srcdoc");
    if (!html) {
        console.error("no HTML to restore");
        return;
    }
    selectedPageVersion.value = await createPageVersion(
        graffiti,
        version.value.object,
        html,
        pageVersions.value.map<string>((v) => v.url),
        `Restore: ${version.value.summary}`,
        session,
    );
}

const selectedPageVersion = ref<PageVersionObject | null | undefined>(
    undefined,
);
watch(pageVersions, async (versions) => {
    selectedPageVersion.value = versions.at(0) || null;
});
</script>

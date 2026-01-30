<template>
    <ol>
        <li v-for="(version, index) in pageVersions" :key="version.url">
            <article :id="version.url">
                <button
                    :class="{
                        selected: selectedPageVersion?.url === version.url,
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
                    {{ new Date(version.value.published).toLocaleString() }}
                </p>

                <footer v-if="session">
                    <ul v-if="selectedPageVersion?.url === version.url">
                        <li v-if="$graffitiSession.value && index !== 0">
                            <button
                                @click="restorePageVersion(version, session)"
                            >
                                Restore
                            </button>
                        </li>
                        <li
                            v-if="
                                $graffitiSession.value?.actor === version.actor
                            "
                        >
                            <button
                                @click="
                                    deletePageVersion(
                                        graffiti,
                                        version,
                                        session,
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
    <!-- <ul>
        <li>TODO!!</li>
        <li>Filter by authorship (makes it "look" owned)</li>
        <li>Filters (by author or previous) go into the URL so they can be shared</li>
    </ul> -->

    <TwoPaneLayout rightTitle="Preview" leftTitle="History" v-else>
        <template #left-pane>
            <!-- <History
                :pageVersions="pageVersions"
                v-model:selectedPageVersion="selectedPageVersion"
                :session="$graffitiSession.value"
            /> -->
        </template>
        <template #right-pane>
            <!-- <social-wiki-transclude :src="channel" ref="history></social-wiki-transclude> -->
        </template>
    </TwoPaneLayout>
</template>

<script lang="ts" setup>
import type { GraffitiSession } from "@graffiti-garden/api";
import {
    createPageVersion,
    deletePageVersion,
    type PageVersionObject,
} from "../helpers/page-versions";
import {
    useGraffiti,
    GraffitiActorToHandle,
} from "@graffiti-garden/wrapper-vue";

const props = defineProps<{
    pageVersions: PageVersionObject[];
    session?: GraffitiSession | null;
}>();
const selectedPageVersion = defineModel<PageVersionObject | null>(
    "selectedPageVersion",
);

const graffiti = useGraffiti();

async function restorePageVersion(
    version: PageVersionObject,
    session: GraffitiSession,
) {
    const media = await graffiti.getMedia(version.value.result.media, {
        types: ["text/html"],
    });
    const html = await media.data.text();
    selectedPageVersion.value = await createPageVersion(
        graffiti,
        version.value.object,
        html,
        props.pageVersions.map((v) => v.url),
        `Restored from ${version.url}`,
        session,
    );
}

const pageVersions = ref<PageVersionObject[]>([]);

const selectedPageVersion = ref<PageVersionObject | null | undefined>(
    undefined,
);
const selectedPageHtml = ref<string | null | undefined>(undefined);
watch(
    channel,
    async (pageName) => {
        // Clear versions
        pageVersions.value = [];
        selectedPageVersion.value = undefined;
        selectedPageHtml.value = undefined;

        // Compute new page versions
        pageVersions.value = await getPageVersions(graffiti, pageName);
        selectedPageVersion.value = pageVersions.value.at(0) || null;
    },
    { immediate: true },
);

watch(selectedPageVersion, async (selected) => {
    selectedPageHtml.value = undefined;
    if (!selected) {
        selectedPageHtml.value = selected;
        return;
    }

    // Fetch the HTML content of the selected page version
    const media = await graffiti.getMedia(selected.value.result.media, {
        types: ["text/html"],
    });
    const html = await media.data.text();

    // Double check that the selected page version is still the same
    if (selected.url !== selectedPageVersion.value?.url) return;
    // If so, assign the html
    selectedPageHtml.value = html;
});
</script>

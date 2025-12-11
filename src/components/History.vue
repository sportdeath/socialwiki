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
                    {{ version.actor }}
                    edited on
                    {{ new Date(version.value.published).toLocaleString() }}
                </p>

                <footer>
                    <ul v-if="selectedPageVersion?.url === version.url">
                        <li v-if="$graffitiSession.value && index !== 0">
                            <button @click="restorePageVersion(version)">
                                Restore
                            </button>
                        </li>
                        <li
                            v-if="
                                $graffitiSession.value?.actor === version.actor
                            "
                        >
                            <button @click="deletePageVersion(version)">
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
</template>

<script lang="ts" setup>
import {
    createPageVersion,
    deletePageVersion,
    getPageContent,
    type PageVersionObject,
} from "../graffiti/page-versions";

const props = defineProps<{
    pageVersions: PageVersionObject[];
}>();
const selectedPageVersion = defineModel<PageVersionObject | null>(
    "selectedPageVersion",
);

async function restorePageVersion(version: PageVersionObject) {
    const content = await getPageContent(version.value.contentUrl);
    selectedPageVersion.value = await createPageVersion(
        version.value.pageChannel,
        content,
        props.pageVersions.map((v) => v.url),
        `Restored from ${version.url}`,
    );
}
</script>

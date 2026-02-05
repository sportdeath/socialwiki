import { createApp } from "vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import Edit from "../../frontend/Edit.vue";
import type { Graffiti } from "@graffiti-garden/api";

createApp(Edit)
  .use(GraffitiPlugin, {
    graffiti: new window.graffiti() as unknown as Graffiti,
  })
  .mount("#app");

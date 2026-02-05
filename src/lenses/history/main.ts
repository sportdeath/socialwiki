import { createApp } from "vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import History from "./History.vue";
import type { Graffiti } from "@graffiti-garden/api";

createApp(History)
  .use(GraffitiPlugin, {
    graffiti: new window.graffiti() as unknown as Graffiti,
  })
  .mount("#app");

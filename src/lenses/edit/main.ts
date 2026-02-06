import { createApp } from "vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import Edit from "./Edit.vue";

createApp(Edit)
  .use(GraffitiPlugin, {
    graffiti: new window.graffiti(),
  })
  .mount("#app");

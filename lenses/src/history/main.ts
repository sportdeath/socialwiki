import { createApp } from "vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import History from "./History.vue";

createApp(History)
  .use(GraffitiPlugin, {
    graffiti: new window.Graffiti(),
  })
  .mount("#app");

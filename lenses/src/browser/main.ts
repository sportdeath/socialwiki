import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { createApp } from "vue";
import "../style.css";
import App from "./App.vue";

const graffiti = new window.Graffiti();
createApp(App).use(GraffitiPlugin, { graffiti }).mount("#app");

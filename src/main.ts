import { createApp } from "vue";
import VueClickAway from "vue3-click-away";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import "./style.css";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { graffiti } from "./page-init/rpc-server";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      redirect: {
        name: "view",
        params: { channel: "Social.Wiki" },
      },
    },
    {
      path: "/w/:channel",
      name: "view",
      component: () => import("./components/View.vue"),
      props: true,
    },
    {
      path: "/e/:channel",
      name: "edit",
      component: () => import("./components/Edit.vue"),
      props: true,
    },
  ],
});

createApp(RouterView)
  .use(VueClickAway)
  .use(GraffitiPlugin, { graffiti })
  .use(router)
  .mount("#app");

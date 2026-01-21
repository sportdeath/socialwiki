import { createApp } from "vue";
import VueClickAway from "vue3-click-away";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import "./style.css";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { GraffitiDecentralized } from "@graffiti-garden/implementation-decentralized";

const router = createRouter({
  history: createWebHistory("/socialwiki/"),
  routes: [
    {
      path: "/",
      name: "home",
      redirect: {
        name: "view",
        params: { channel: "socialwiki" },
      },
    },
    {
      path: "/v/:channel",
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
  .use(GraffitiPlugin, {
    graffiti: new GraffitiDecentralized(),
  })
  .use(router)
  .mount("#app");

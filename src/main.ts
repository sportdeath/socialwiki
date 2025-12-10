import { createApp } from "vue";
import VueClickAway from "vue3-click-away";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import View from "./components/View.vue";
import Edit from "./components/Edit.vue";
import "./style.css";

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
      component: View,
      props: true,
    },
    {
      path: "/e/:channel",
      name: "edit",
      component: Edit,
      props: true,
    },
  ],
});

createApp(RouterView).use(VueClickAway).use(router).mount("#app");

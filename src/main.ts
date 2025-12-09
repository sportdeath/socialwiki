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
      name: "view",
      component: View,
    },
    {
      path: "/edit",
      name: "edit",
      component: Edit,
    },
  ],
});

createApp(RouterView).use(VueClickAway).use(router).mount("#app");

import { createApp } from "vue";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import "./style.css";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { serveGraffiti } from "./page-init/rpc-server";
import { installTransclude } from "./page-init/transclude";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      redirect: {
        name: "view",
        params: { pageName: "Social.Wiki" },
      },
    },
    {
      path: "/w/:pageName",
      name: "view",
      component: () => import("./components/View.vue"),
      props: true,
    },
    {
      path: "/h/:pageName",
      name: "history",
      component: () => import("./components/View.vue"),
      props: (route) => ({ history: true, pageName: route.params.pageName }),
    },
    {
      path: "/e/:pageName",
      name: "edit",
      component: () => import("./components/Edit.vue"),
      props: true,
    },
  ],
});

// Set up a graffiti "server" that is served
// to all the "client" pages
const graffiti = serveGraffiti();
// Add the web components
installTransclude(graffiti);

createApp(RouterView)
  .use(GraffitiPlugin, { graffiti })
  .use(router)
  .mount("#app");

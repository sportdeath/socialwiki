import { createApp } from "vue";
import { createRouter, createWebHistory, RouterView } from "vue-router";
import "./style.css";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { serveGraffiti } from "./backend/graffiti-server";
import { installTransclude } from "./backend/transclude";
import { serveNavigation } from "./backend/navigation-server";

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
      component: () => import("./frontend/View.vue"),
      props: true,
    },
    {
      path: "/h/:pageName",
      name: "history",
      component: () => import("./frontend/View.vue"),
      props: (route) => ({ history: true, pageName: route.params.pageName }),
    },
    {
      path: "/e/:pageName",
      name: "edit",
      component: () => import("./frontend/Edit.vue"),
      props: true,
    },
  ],
});

// Set up a graffiti "server" that is served
// to all the "client" pages
const graffiti = serveGraffiti();
// Add the web components
const origin = window.location.origin;
installTransclude(graffiti, origin);
serveNavigation((to) => {
  const url = new URL(to, window.location.href).toString();
  if (url.startsWith(origin)) {
    router.push(url.slice(origin.length));
  } else {
    window.location.href = url;
  }
});

createApp(RouterView)
  .use(GraffitiPlugin, { graffiti })
  .use(router)
  .mount("#app");

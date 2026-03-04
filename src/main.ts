import "./style.css";
import { createApp } from "vue";
import {
  createRouter,
  createWebHashHistory,
  RouterView,
} from "vue-router";
import App from "./App.vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { serveGraffiti } from "./backend/graffiti-server";
import { installTransclude } from "./backend/transclude";
import { handleGraffitiGuardRequest } from "./guard/graffiti-guard";

// Set up a graffiti "server" that is served
// to all the "client" pages
const { graffiti, listConnectedWindows } = serveGraffiti(handleGraffitiGuardRequest);

const router = createRouter({
  // Use web hash history so that the page name
  // is never sent to the server. This means that
  // when Graffiti becomes E2EE, page names will
  // never touch any server in the clear.
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      redirect: "/v#/Social.Wiki",
    },
    {
      path: "/:path(.+)",
      component: App,
      props: () => {
        // Use the raw hash route to avoid Vue Router query decoding/re-encoding
        // that can alter reserved characters in lens params.
        const hash = window.location.hash;
        const route = hash.replace(/^#\/?/, "");
        return {
          address: route,
        };
      },
    },
  ],
});
// Add the web components
const origin = window.location.origin;
installTransclude(graffiti, origin);

createApp(RouterView)
  .provide("listConnectedWindows", listConnectedWindows)
  .use(GraffitiPlugin, { graffiti })
  .use(router)
  .mount("#app");

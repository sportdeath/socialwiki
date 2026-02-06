import "./style.css";
import { createApp } from "vue";
import {
  createRouter,
  createWebHashHistory,
  RouterView,
  stringifyQuery,
} from "vue-router";
import App from "./App.vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { serveGraffiti } from "./backend/graffiti-server";
import { installTransclude } from "./backend/transclude";

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
      redirect: "/view/Social.Wiki",
    },
    {
      path: "/:name",
      redirect: (to) => {
        return { path: `/view/${to.params.name}` };
      },
    },
    {
      path: "/:lens/:path(.+)",
      component: App,
      props: (to) => {
        const hash = to.hash;
        const path = to.params.path;
        const query = stringifyQuery(to.query);
        return {
          lens: to.params.lens,
          address: `${path}${query.length ? `?${query}` : ""}${hash}`,
        };
      },
    },
  ],
});

// Set up a graffiti "server" that is served
// to all the "client" pages
const graffiti = serveGraffiti();
// Add the web components
const origin = window.location.origin;
installTransclude(graffiti, origin);

createApp(RouterView)
  .use(GraffitiPlugin, { graffiti })
  .use(router)
  .mount("#app");

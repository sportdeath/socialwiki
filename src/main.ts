import { createApp } from "vue";
import {
  createRouter,
  createWebHashHistory,
  RouterView,
  stringifyQuery,
} from "vue-router";
import "./style.css";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { serveGraffiti } from "./backend/graffiti-server";
import { installTransclude } from "./backend/transclude";
import { serveNavigation } from "./backend/navigation-server";
import View from "./frontend/View.vue";

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
      component: View,
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
serveNavigation((to, fromSrcdoc) => {
  const url = new URL(to, origin);
  if (url.origin !== origin + "/#") {
    window.location.href = url.toString();
    return;
  }
  let route = url.toString().slice(origin.length + 2);

  // Treat pure hashes or queries as relative.
  // All other paths are treated as absolute.
  // This ensures that copied pages operate exactly
  // the same as each other.
  if (route.startsWith("#") || route.startsWith("?")) {
    const currentRoute = router.currentRoute;
    console.log("current route is");
    console.log(currentRoute);

    // If editing a page, save the source in local
    // storage because it is too large to be passed
    // in the URL
    if (route === "?edit") {
      route += "=";
      if (fromSrcdoc !== null) {
        const draftKey = `draft:${crypto.randomUUID()}`;
        localStorage.setItem(draftKey, fromSrcdoc);
        route += `${draftKey}`;
      }
    }
  }

  router.push(route);
});

createApp(RouterView)
  .use(GraffitiPlugin, { graffiti })
  .use(router)
  .mount("#app");

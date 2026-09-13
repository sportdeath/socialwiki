import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { createApp } from "vue";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import "../style.css";
import App from "./App.vue";
import { decodeAddress, encodeRouteForRouter } from "./browser-route";

const graffiti = new window.Graffiti();
const router = createRouter({
  // This document runs in an originless sandbox. Keep its routing in memory;
  // navigation outside the lens belongs to the navigation bridge. The bridge
  // ultimately stores the address in the top-level hash, so page names are
  // not sent to the web server.
  history: createMemoryHistory(),
  routes: [
    {
      path: "/",
      name: "home",
      redirect: "/v?/Social.Wiki",
    },
    {
      path: "/:path(.+)",
      component: App,
      props: (route) => {
        // Read fullPath so the Social.Wiki query remains part of the address
        // instead of being reconstructed from Vue Router's parsed query.
        const addressEncoded = route.fullPath.replace(/^\//, "");
        return { address: decodeAddress(addressEncoded) };
      },
    },
  ],
});

// The browser is sandboxed inside the kernel host, so its in-memory route and
// the real top-level hash need to cross the navigation bridge in both
// directions. Wait for the parent's initial query before writing upward so a
// router redirect cannot overwrite an existing address during startup.
let navigationReady = false;
const syncRouteFromParent = () => {
  navigationReady = true;
  const address =
    window.address === undefined ? undefined : decodeAddress(window.address);
  const route = encodeRouteForRouter(address ?? "");
  if (router.currentRoute.value.fullPath !== route) {
    void router.replace(route);
  } else if (address === undefined) {
    window.navigate(
      new URL(`#${router.currentRoute.value.fullPath}`, document.baseURI).href,
    );
  }
};
window.addEventListener("querychange", syncRouteFromParent);

router.afterEach((route) => {
  if (!navigationReady) return;
  const address = decodeAddress(route.fullPath.replace(/^\//, ""));
  const parentAddress =
    window.address === undefined ? undefined : decodeAddress(window.address);
  if (address === parentAddress) return;
  window.navigate(new URL(`#${route.fullPath}`, document.baseURI).href);
});

createApp(RouterView)
  .use(GraffitiPlugin, { graffiti })
  .use(router)
  .mount("#app");

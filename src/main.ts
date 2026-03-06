import "./style.css";
import { createApp } from "vue";
import { createRouter, createWebHashHistory, RouterView } from "vue-router";
import App from "./App.vue";
import { GraffitiPlugin } from "@graffiti-garden/wrapper-vue";
import { serveGraffiti } from "./backend/graffiti-server";
import { installTransclude } from "./backend/transclude";
import { handleGraffitiGuardRequest } from "./guard/graffiti-guard";
import {
  composeAddress,
  composeQuery,
  parseAddress,
  parseQuery,
} from "./backend/route";

function safeDecodeComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeAddressForRouter(address?: string): string {
  if (address === undefined) return "";

  const { name, query } = parseAddress(address);
  const decodedName = safeDecodeComponent(name);
  if (!query.length) return composeAddress(decodedName, query);

  const { params, address: nestedAddress } = parseQuery(query);
  const decodedNestedAddress =
    nestedAddress === undefined
      ? undefined
      : decodeAddressForRouter(nestedAddress);
  return composeAddress(
    decodedName,
    composeQuery(params, decodedNestedAddress),
  );
}

function decodeRouteForApp(route: string): string {
  const normalized = route.replace(/^\/+/, "");
  return decodeAddressForRouter(normalized);
}

// Set up a graffiti "server" that is served
// to all the "client" pages
const { graffiti, listConnectedWindows } = serveGraffiti(
  handleGraffitiGuardRequest,
);

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
      redirect: "/v?/Social.Wiki",
    },
    {
      path: "/:path(.+)",
      component: App,
      props: () => {
        // Use the raw hash route to avoid Vue Router query decoding/re-encoding
        // that can alter reserved characters in lens params.
        const hash = window.location.hash;
        const route = hash.replace(/^#\/?/, "");
        return { address: decodeRouteForApp(route) };
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

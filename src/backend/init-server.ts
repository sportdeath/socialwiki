import { serveGraffiti } from "./graffiti-server";
import { installTransclude } from "./transclude";
import { serveNavigation } from "./navigation-server";

const currentScriptSrc = (document.currentScript as HTMLScriptElement).src;
const origin = new URL(currentScriptSrc).origin;

const graffiti = serveGraffiti();
installTransclude(graffiti, origin);
serveNavigation((to) => {
  const url = new URL(to, origin).toString();
  window.location.href = url;
});

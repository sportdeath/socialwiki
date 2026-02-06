import { serveGraffiti } from "./graffiti-server";
import { installTransclude } from "./transclude";
import { serveNavigation } from "./navigation-server";

const isClassic = document.currentScript !== null;
const currentScriptSrc = isClassic
  ? (document.currentScript as HTMLScriptElement).src
  : import.meta.url;
const origin = new URL(currentScriptSrc).origin;

const graffiti = serveGraffiti();
installTransclude(graffiti, origin);
serveNavigation((to) => {
  const url = new URL(to, origin).toString();
  window.location.href = url;
});

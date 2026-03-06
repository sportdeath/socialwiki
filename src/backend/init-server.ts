import { serveGraffiti } from "./graffiti-server";
import { installTransclude } from "./transclude";
import { serveNavigation } from "./navigation-server";

const isClassic = document.currentScript !== null;
const currentScriptSrc = isClassic
  ? (document.currentScript as HTMLScriptElement).src
  : import.meta.url;
const origin = new URL(currentScriptSrc).origin;

function extractHashRoute(source: string, rootOrigin: string): string | null {
  if (source.startsWith("#/")) return source.slice(2);
  if (source.startsWith("/#/")) return source.slice(3);
  if (source.startsWith(`${rootOrigin}/#/`)) return source.slice(rootOrigin.length + 3);
  return null;
}

const { graffiti } = serveGraffiti();
installTransclude(graffiti, origin);
serveNavigation((to) => {
  const internalRoute = extractHashRoute(to, origin);
  if (internalRoute !== null) {
    window.location.hash = `#/${internalRoute}`;
    return;
  }

  const url = new URL(to, origin).toString();
  window.location.href = url;
});

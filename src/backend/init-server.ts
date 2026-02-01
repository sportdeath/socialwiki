import { serveGraffiti } from "./graffiti-server";
import { installTransclude } from "./transclude";
import { serveNavigation } from "./navigation-server";

const graffiti = serveGraffiti();
installTransclude(graffiti);
serveNavigation((to) => {
  if (to.startsWith("web+sw:")) {
    window.location.href = "https://social.wiki/" + to.slice(7);
  } else {
    window.location.href = to;
  }
});

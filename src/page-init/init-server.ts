import { serveGraffiti } from "./rpc-server";
import { installTransclude } from "./transclude";
const graffiti = serveGraffiti();
installTransclude(graffiti);

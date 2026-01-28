import { serveGraffiti } from "./rpc-server";

const iframe = document.querySelector("iframe");
if (iframe) {
  serveGraffiti(iframe);
}

import { GraffitiRpcClient } from "@graffiti-garden/wrapper-iframe-rpc/client";

// Wrap the RPC client so that it takes zero arguments.
// Sites can just call `new window.Graffiti()`
const SocialWikiGraffiti = function SocialWikiGraffiti() {
  return new GraffitiRpcClient({ remoteWindow: window.parent });
} as unknown as { new (): GraffitiRpcClient };

declare global {
  interface Window {
    Graffiti: typeof SocialWikiGraffiti;
  }
}

export function installGraffitiChild() {
  window.Graffiti = SocialWikiGraffiti;
  return new window.Graffiti();
}

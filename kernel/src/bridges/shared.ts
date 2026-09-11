import type { Graffiti } from "@graffiti-garden/api";
import type { DocumentResolver } from "./resolution/shared";

export type BridgedServices = {
  graffiti: Graffiti;
  resolve: DocumentResolver;
  /** Stable navigation base; descendants inherit it unless they declare their own. */
  baseUrl: Promise<string>;
}

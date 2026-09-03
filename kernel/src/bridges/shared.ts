import type { Graffiti } from "@graffiti-garden/api";
import type { DocumentResolver } from "./resolution/shared";

export type BridgedServices = {
  graffiti: Graffiti;
  resolve: DocumentResolver;
  /** The document's stable base, inherited unchanged by its descendants. */
  baseUrl: Promise<string>;
}

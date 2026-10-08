import type { Graffiti } from "@graffiti-garden/api";
import type { DocumentResolver } from "./resolution/shared";
import type { DocumentRouteState } from "./navigation/document-route";
import type { PeripheralsService } from "./peripherals/shared";
import type { AutosizeContext } from "./autosize/shared";

export type BridgedServices = {
  createGraffiti: () => Graffiti;
  resolve: DocumentResolver;
  documentRoute: DocumentRouteState;
  peripherals: PeripheralsService;
  autosize?: AutosizeContext;
};

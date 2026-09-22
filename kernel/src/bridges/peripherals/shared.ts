import type { PeripheralPermissions } from "./permissions";
import { validateSource, type SourceSegment } from "../source";

export const PERIPHERALS_CHANNEL = "socialwiki-peripherals-v1";
export type PeripheralRequest = {
  source: SourceSegment[];
  capability: string;
  method: string;
  args: unknown[];
};
export type PeripheralUpdate =
  | { type: "data"; value: unknown }
  | { type: "error"; name: string; message: string; constraint?: string }
  | { type: "end" };
export type PeripheralSink = (update: PeripheralUpdate) => void;
export type PeripheralSession = {
  stop(): void;
  /** Messages stay within this request and its existing permission scope. */
  send?(message: unknown): Promise<unknown>;
};
export type PeripheralFeatures = {
  geolocation?: boolean;
  media?: MediaTrackSupportedConstraints;
  enumerateDevices?: boolean;
  filePickers?: string[];
  notifications?: { properties: string[]; maxActions?: number };
  notificationPermission?: NotificationPermission;
};
export type AdapterContext = { source: SourceSegment[]; permissions: PeripheralPermissions };
export type PeripheralsService = {
  features: PeripheralFeatures;
  // Returns a session immediately, even before permission is decided.
  // Updates are asynchronous, like the underlying browser APIs.
  start(request: PeripheralRequest, update: PeripheralSink): PeripheralSession;
  showPermissions(source: SourceSegment[]): void | Promise<void>;
  registerDocument(source: SourceSegment[]): () => void;
};
export type Subscription =
  | { kind: "document"; source: SourceSegment[] }
  | ({ kind: "request" } & PeripheralRequest);
export type ParentMethods = {
  open(id: number, subscription: Subscription): void;
  close(id: number): void;
  send(id: number, message: unknown): Promise<unknown>;
  showPermissions(source: SourceSegment[]): void | Promise<void>;
};
export type ChildMethods = { update(id: number, value: PeripheralUpdate): void };
export type PermissionDescription = { label: string };
export type PermissionRequirement = PermissionDescription & { capability: string };
export type HostAdapter = {
  features?: PeripheralFeatures;
  // Validate before prompting. The returned operation may touch native APIs
  // only when the host guard has authorized this request.
  prepare(method: string, args: unknown[], context?: AdapterContext): {
    permissions: PermissionRequirement[];
    start(update: PeripheralSink): PeripheralSession;
  };
};

export function validateSubscription(value: Subscription): Subscription {
  if (!value || (value.kind !== "document" && value.kind !== "request")) {
    throw new TypeError("Invalid peripherals subscription.");
  }
  const source = validateSource(value.source);
  if (value.kind === "document") return { kind: "document", source };
  if (typeof value.capability !== "string" || typeof value.method !== "string" || !Array.isArray(value.args)) {
    throw new TypeError("Invalid peripherals request.");
  }
  return { kind: "request", capability: value.capability, method: value.method, args: value.args, source };
}

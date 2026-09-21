import type { GraffitiObject, GraffitiObjectBase, JSONSchema } from "@graffiti-garden/api";

export function protectionSchema(siteName: string) {
  return {
    properties: {
      value: {
        type: "object",
        properties: {
          "site name": { const: siteName },
          time: { type: "number" },
        },
        required: ["site name", "time"],
        anyOf: [
          {
            properties: { action: { const: "Protect site" } },
            required: ["action"],
          },
          {
            properties: {
              action: { const: "Remove site protection" },
              "protection removed": { type: "string" },
            },
            required: ["action", "protection removed"],
          },
        ],
      },
    },
    required: ["value"],
  } as const satisfies JSONSchema;
}

export type ProtectionSchema = ReturnType<typeof protectionSchema>;
export type ProtectionObject = GraffitiObject<ProtectionSchema>;

export function trustSchema(actor?: string) {
  return {
    properties: {
      value: {
        type: "object",
        properties: {
          action: { enum: ["Trust editor", "Stop trusting editor"] },
          editor: { type: "string" },
          time: { type: "number" },
        },
        required: ["action", "editor", "time"],
      },
      ...(actor !== undefined ? { actor: { const: actor } } : {}),
    },
    required: ["value"],
  } as const satisfies JSONSchema;
}

export type TrustSchema = ReturnType<typeof trustSchema>;
export type TrustObject = GraffitiObject<TrustSchema>;

/** Narrow results from a site-state union query. */
export function isProtectionObject(object: GraffitiObjectBase): object is ProtectionObject {
  const value = object.value as Record<string, unknown>;
  return (
    typeof value["site name"] === "string" &&
    typeof value.time === "number" &&
    (value.action === "Protect site" ||
      (value.action === "Remove site protection" &&
        typeof value["protection removed"] === "string"))
  );
}

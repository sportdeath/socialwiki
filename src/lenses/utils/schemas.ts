import type { GraffitiObject, JSONSchema } from "@graffiti-garden/api";

export function annotationSchema(
  annotationActivityTypes: string[],
  options?: {
    object?: string;
    actor?: string;
  },
) {
  return {
    properties: {
      value: {
        properties: {
          activity: { enum: annotationActivityTypes },
          // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-object-term
          object: {
            type: "string",
            ...(options?.object ? { const: options.object } : {}),
          },
          // https://www.w3.org/TR/activitystreams-vocabulary/#dfn-published
          published: { type: "number" },
        },
        required: ["activity", "object", "published"],
      },
      ...(options?.actor
        ? {
            actor: { const: options.actor },
          }
        : {}),
    },
  } as const satisfies JSONSchema;
}

export type AnnotationSchema = ReturnType<typeof annotationSchema>;
export type AnnotationObject = GraffitiObject<AnnotationSchema>;

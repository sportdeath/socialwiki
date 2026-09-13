export const lensDirectories = {
  v: "view",
  e: "edit",
  h: "history",
} as const;

export type Lens = keyof typeof lensDirectories;

export const lenses = Object.keys(lensDirectories) as Lens[];

export function isLens(value: string): value is Lens {
  return Object.hasOwn(lensDirectories, value);
}

export const LENS_PUBLISHED_EVENT = "sw-lens-published";

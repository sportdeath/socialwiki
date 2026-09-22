export const lensDirectories = {
  browser: "browser",
  v: "view",
  e: "edit",
  h: "history",
} as const;

export type Lens = keyof typeof lensDirectories;

export const lenses = Object.keys(lensDirectories) as Lens[];

export type GovernanceLens = Exclude<Lens, "browser">;

export function isGovernanceLens(value: string): value is GovernanceLens {
  return value === "v" || value === "e" || value === "h";
}

export function isLens(value: string): value is Lens {
  return Object.hasOwn(lensDirectories, value);
}

import type { GraffitiGuardRequest } from "../backend/graffiti-server";

export type GraffitiPermissionCategory =
  | "modify_data"
  | "access_private_data"
  | "logout";

export function methodToCategory(
  method: GraffitiGuardRequest["method"],
): GraffitiPermissionCategory {
  switch (method) {
    case "post":
    case "postMedia":
    case "delete":
    case "deleteMedia":
      return "modify_data";
    case "get":
    case "getMedia":
    case "discover":
      return "access_private_data";
    case "logout":
      return "logout";
    case "login":
    case "actorToHandle":
    case "handleToActor":
      throw new Error(`No permission category for method: ${method}`);
    default: {
      const exhaustive: never = method;
      throw new Error(`Unhandled method: ${exhaustive}`);
    }
  }
}

export function describeCategory(category: GraffitiPermissionCategory): string {
  switch (category) {
    case "modify_data":
      return "Modify your data";
    case "access_private_data":
      return "Access private data";
    case "logout":
      return "Log out";
    default: {
      const exhaustive: never = category;
      return exhaustive;
    }
  }
}

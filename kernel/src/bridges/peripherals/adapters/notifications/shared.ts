export type NoticeOptions = NotificationOptions & {
  image?: string; timestamp?: number; vibrate?: number | number[];
  actions?: unknown[]; navigate?: string; renotify?: boolean;
};
export type Notice = { title: string; options: NoticeOptions };
// Only advertise properties whose behavior the facade implements, and only
// when the host browser supports them. New API behavior still needs review.
export const notificationProperties = [
  "title", "body", "dir", "lang", "tag", "icon", "badge", "image", "data",
  "requireInteraction", "renotify", "silent", "timestamp", "vibrate", "actions",
] as const;
export type NotificationCommand = { id: number; method: "permission" | "show" | "close"; notice?: Notice; images?: Record<string, Blob> };
export type NotificationUpdate =
  | { type: "permission"; permission: NotificationPermission; id?: number }
  | { type: "event"; id: number; event: string; message?: string };

/** Local validation preserves synchronous constructor errors before crossing RPC. */
export function normalizeNotice(title: string, input: NoticeOptions = {}, base = document.baseURI): Notice {
  input ??= {};
  const options: NoticeOptions = {
    body: String(input.body ?? ""), dir: input.dir ?? "auto", lang: String(input.lang ?? ""),
    tag: String(input.tag ?? ""), icon: "", badge: "", image: "",
    data: input.data === undefined ? null : structuredClone(input.data),
    requireInteraction: Boolean(input.requireInteraction), renotify: Boolean(input.renotify),
    silent: input.silent == null ? null : Boolean(input.silent),
    timestamp: input.timestamp === undefined ? Date.now() : Number(input.timestamp),
    vibrate: input.vibrate === undefined ? undefined : (Array.isArray(input.vibrate) ? input.vibrate : [input.vibrate]).map(Number),
  };
  if (!["auto", "ltr", "rtl"].includes(options.dir!)) throw new TypeError("Invalid notification direction.");
  if (input.actions?.length) throw new TypeError("Notification actions require persistent service-worker notifications.");
  // Never forward document-supplied navigation to the privileged host unchecked.
  // TODO: route navigate through the existing navigation bridge, preserving
  // ancestor handling and public routes; native navigate bypasses both.
  if (input.navigate) throw new DOMException("Notification.navigate is not supported. Handle clicks in the running document instead.", "NotSupportedError");
  if (options.silent && input.vibrate !== undefined) throw new TypeError("A silent notification cannot specify vibration.");
  if (options.renotify && !options.tag) throw new TypeError("renotify requires a nonempty tag.");
  for (const key of ["icon", "badge", "image"] as const) {
    if (input[key]) {
      try { options[key] = new URL(String(input[key]), base).href; } catch { /* Native invalid image URLs are ignored. */ }
    }
  }
  return { title: String(title), options };
}

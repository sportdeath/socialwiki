type ChildListener = (payload: unknown) => void;
type ParentListener = (eventName: string, payload: unknown) => void;

/** An in-memory connection with the same public shape as the event bridge. */
export function createEventBridge() {
  const childListeners = new Map<string, Set<ChildListener>>();
  const parentListeners = new Set<ParentListener>();

  const child = {
    emit(eventName: string, payload?: unknown) {
      for (const listener of parentListeners) listener(eventName, payload);
    },
    listen(eventName: string, listener: ChildListener) {
      const listeners = childListeners.get(eventName) ?? new Set();
      listeners.add(listener);
      childListeners.set(eventName, listeners);
      return () => listeners.delete(listener);
    },
  };

  const parent = {
    destroy() {
      childListeners.clear();
      parentListeners.clear();
    },
    listen(listener: ParentListener) {
      parentListeners.add(listener);
      return () => parentListeners.delete(listener);
    },
    send(eventName: string, payload?: unknown) {
      for (const listener of childListeners.get(eventName) ?? []) {
        listener(payload);
      }
    },
  };

  return { child, parent };
}

import { expect, it, vi } from "vitest";
import { installEventsChild } from "../src/bridges/events/child";
import { installEventsParent } from "../src/bridges/events/parent";
import {
  EVENT_TO_CHILD,
  EVENT_TO_PARENT,
} from "../src/bridges/events/shared";

it("forwards only inbound events left unhandled by the child document", () => {
  const events = installEventsChild();
  const observe = vi.fn();
  const forward = vi.fn();
  const observeHandled = vi.fn();
  window.addEventListener("sw-public", observe);
  window.addEventListener("sw-handled", observeHandled);
  window.onUnhandledEvent = forward;

  const send = (eventName: string, payload: unknown) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        source: window.parent,
        data: { type: EVENT_TO_CHILD, eventName, payload },
      }),
    );
  };

  send("sw-public", { value: 1 });
  expect(observe).toHaveBeenCalledWith(
    expect.objectContaining({ type: "sw-public", detail: { value: 1 } }),
  );
  expect(forward).toHaveBeenCalledOnce();

  events.listen("sw-handled", (event) => event.preventDefault());
  send("sw-handled", { value: 2 });
  expect(observeHandled).not.toHaveBeenCalled();
  expect(forward).toHaveBeenCalledOnce();

  const block = (event: Event) => event.preventDefault();
  window.addEventListener("sw-blocked", block);
  send("sw-blocked", { value: 3 });
  expect(forward).toHaveBeenCalledOnce();

  const click = vi.fn();
  window.addEventListener("click", click);
  send("click", { value: 4 });
  expect(click).not.toHaveBeenCalled();

  expect(() => events.emit("click")).toThrow(
    'Bridged event names must start with "sw-"',
  );

  window.removeEventListener("sw-public", observe);
  window.removeEventListener("sw-handled", observeHandled);
  window.removeEventListener("sw-blocked", block);
  window.removeEventListener("click", click);
  window.onUnhandledEvent = undefined;
});

it("validates the sender and lets listeners consume events before async work", async () => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const passThrough = vi.fn();
  const events = installEventsParent(iframe, passThrough);
  const finish = vi.fn();
  const stopHandling = events.listen(async (event) => {
    if (event.type !== "sw-handled") return;
    event.preventDefault();
    await Promise.resolve();
    finish(event.detail);
  });
  const observe = vi.fn();
  events.listen(observe);

  const emit = (eventName: string, payload: unknown) => {
    window.dispatchEvent(
      new MessageEvent("message", {
        source: iframe.contentWindow,
        data: { type: EVENT_TO_PARENT, eventName, payload },
      }),
    );
  };

  emit("sw-public", { value: 1 });
  emit("sw-handled", { value: 2 });
  emit("click", { value: 3 });
  window.dispatchEvent(new MessageEvent("message", {
    source: window,
    data: {
      type: EVENT_TO_PARENT,
      eventName: "sw-public",
      payload: "spoofed",
    },
  }));

  expect(passThrough).toHaveBeenCalledOnce();
  expect(passThrough).toHaveBeenCalledWith(expect.objectContaining({
    type: "sw-public", detail: { value: 1 },
  }));
  expect(observe).toHaveBeenCalledTimes(2);
  expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({
    type: "sw-handled", detail: { value: 2 }, defaultPrevented: true,
  }));
  expect(finish).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(finish).toHaveBeenCalledWith({ value: 2 });

  stopHandling();
  emit("sw-handled", { value: 3 });
  expect(passThrough).toHaveBeenCalledTimes(2);

  expect(() => events.send("click")).toThrow(
    'Bridged event names must start with "sw-"',
  );

  events.destroy();
  iframe.remove();
});

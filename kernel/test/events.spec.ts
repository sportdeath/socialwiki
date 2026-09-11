import { expect, it, vi } from "vitest";
import { installEventsParent } from "../src/bridges/events/parent";
import { EVENT_TO_PARENT } from "../src/bridges/events/shared";

it("validates the sender and lets listeners consume events before async work", async () => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  const passThrough = vi.fn();
  const events = installEventsParent(iframe, passThrough);
  const finish = vi.fn();
  const stopHandling = events.listen(async (event) => {
    if (event.type !== "handled") return;
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

  emit("public", { value: 1 });
  emit("handled", { value: 2 });
  window.dispatchEvent(new MessageEvent("message", {
    source: window,
    data: { type: EVENT_TO_PARENT, eventName: "public", payload: "spoofed" },
  }));

  expect(passThrough).toHaveBeenCalledOnce();
  expect(passThrough).toHaveBeenCalledWith(expect.objectContaining({
    type: "public", detail: { value: 1 },
  }));
  expect(observe).toHaveBeenCalledTimes(2);
  expect(observe).toHaveBeenLastCalledWith(expect.objectContaining({
    type: "handled", detail: { value: 2 }, defaultPrevented: true,
  }));
  expect(finish).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(finish).toHaveBeenCalledWith({ value: 2 });

  stopHandling();
  emit("handled", { value: 3 });
  expect(passThrough).toHaveBeenCalledTimes(2);

  events.destroy();
  iframe.remove();
});

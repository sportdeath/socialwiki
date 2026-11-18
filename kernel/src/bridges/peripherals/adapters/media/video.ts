import type { TrackInfo } from "./shared";

/** Camera frames travel directly to the leaf, with one outstanding pull at a time. */
export function createVideoSender(track: MediaStreamTrack, fail: (error: unknown) => void) {
  const video = document.createElement("video");
  if (typeof createImageBitmap !== "function" || typeof video.requestVideoFrameCallback !== "function") {
    throw new DOMException("Local camera delivery requires ImageBitmap and video frame callback support.", "NotSupportedError");
  }
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("aria-hidden", "true");
  video.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none";
  video.srcObject = new MediaStream([track]);
  document.documentElement.append(video);
  const { port1, port2 } = new MessageChannel();
  let stopped = false;
  let pending = false;
  let callback: number | undefined;
  const playing = video.play();
  void playing.catch((error) => { if (!stopped) fail(error); });
  async function frame() {
    let bitmap: ImageBitmap | undefined;
    try {
      if (stopped) return;
      bitmap = await createImageBitmap(video);
      if (!stopped) port1.postMessage(bitmap, [bitmap]);
    } catch (error) { if (!stopped) fail(error); }
    finally { bitmap?.close(); pending = false; }
  }
  port1.onmessage = ({ data }) => {
    if (stopped || pending || data !== "next") return;
    pending = true;
    void playing.then(() => {
      if (stopped) return;
      callback = video.requestVideoFrameCallback(() => void frame());
    }).catch((error) => { if (!stopped) fail(error); });
  };
  return { port: port2, stop() {
    if (stopped) return;
    stopped = true;
    if (callback !== undefined) video.cancelVideoFrameCallback(callback);
    port1.close(); port2.close();
    video.pause(); video.srcObject = null; video.remove();
  } };
}

export function createVideoReceiver(port: MessagePort, info: TrackInfo, fail: (error: unknown) => void) {
  const canvas = document.createElement("canvas");
  if (typeof canvas.captureStream !== "function") {
    throw new DOMException("Local camera delivery requires canvas captureStream support.", "NotSupportedError");
  }
  canvas.width = info.settings.width || 640;
  canvas.height = info.settings.height || 480;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new DOMException("Could not create the local camera canvas.", "NotSupportedError");
  // Omitting the rate captures each canvas change, including in engines without requestFrame().
  const track = canvas.captureStream().getVideoTracks()[0];
  let stopped = false;
  const ready = new Promise<MediaStreamTrack>((resolve) => {
    port.onmessage = ({ data: bitmap }: MessageEvent<ImageBitmap>) => {
      try {
        if (stopped) return;
        if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
        if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
        context.drawImage(bitmap, 0, 0);
        resolve(track);
        port.postMessage("next");
      } catch (error) { fail(error); }
      finally { bitmap.close(); }
    };
  });
  port.onmessageerror = () => fail(new DOMException("A local camera frame could not be received.", "DataCloneError"));
  port.postMessage("next");
  return { ready, stop() {
    if (stopped) return;
    stopped = true;
    port.close(); track.stop();
    canvas.width = canvas.height = 0;
  } };
}

/**
 * Extract a single frame from a video as a data-URL.
 *
 * Works with both a URL string and a File/Blob (via Object URL).
 * Returns null if the video cannot be decoded.
 */
export async function extractVideoFrame(
  source: string | File | Blob,
  seekTimeSec = 0.5,
): Promise<string | null> {
  const src =
    typeof source === "string" ? source : URL.createObjectURL(source);

  try {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = src;

    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Failed to load video for thumbnail"));
      // Give the browser 5 s to load metadata; after that, bail
      setTimeout(() => reject(new Error("Video thumbnail load timeout")), 5000);
    });

    // Seek close to the start (skip black first-frame on some codecs)
    video.currentTime = Math.min(seekTimeSec, video.duration || 1);

    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Failed to seek video for thumbnail"));
      setTimeout(() => reject(new Error("Video seek timeout")), 3000);
    });

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8);
  } catch {
    return null;
  } finally {
    // Revoke object URL if we created one
    if (typeof source !== "string") {
      URL.revokeObjectURL(src);
    }
  }
}

/**
 * Compresses a video file client-side using Canvas + MediaRecorder.
 *
 * Strategy:
 *  1. Load the video into a hidden <video> element.
 *  2. Draw each frame onto a <canvas> (resized to maxDimension).
 *  3. Capture the canvas stream and record it with MediaRecorder
 *     at a calculated bitrate that targets `maxSizeMB`.
 *  4. Return the compressed Blob.
 *
 * @param {File}   file         – original video File
 * @param {number} maxDimension – max width/height in px (default 720)
 * @param {number} maxSizeMB    – target max output size in MB (default 8)
 * @param {number} maxFps       – frame-rate cap (default 30)
 * @returns {Promise<Blob>}     – compressed video Blob (webm)
 */
export async function compressVideo(
  file,
  maxDimension = 720,
  maxSizeMB = 8,
  maxFps = 30
) {
  // If file is already small enough, skip compression
  if (file.size <= maxSizeMB * 1024 * 1024) {
    console.log("VIDEO: Already under size limit, skipping compression");
    return file;
  }

  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";

  const objectUrl = URL.createObjectURL(file);
  video.src = objectUrl;

  // Wait for metadata
  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Failed to load video metadata"));
    // Timeout after 10s
    setTimeout(() => reject(new Error("Video metadata load timeout")), 10000);
  });

  const { duration, videoWidth, videoHeight } = video;

  if (!duration || !videoWidth || !videoHeight) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Invalid video metadata");
  }

  // Calculate target dimensions (maintain aspect ratio)
  let width = videoWidth;
  let height = videoHeight;
  if (width > maxDimension || height > maxDimension) {
    const scale = Math.min(maxDimension / width, maxDimension / height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  // Make dimensions divisible by 2 (required by most codecs)
  width = width % 2 === 0 ? width : width + 1;
  height = height % 2 === 0 ? height : height + 1;

  // Calculate target bitrate (bits per second)
  const targetBits = maxSizeMB * 8 * 1024 * 1024;
  const bitrate = Math.floor(targetBits / duration);

  console.log("VIDEO: Compressing", {
    originalSize: file.size,
    duration: duration.toFixed(1) + "s",
    originalDimensions: `${videoWidth}x${videoHeight}`,
    targetDimensions: `${width}x${height}`,
    targetBitrate: (bitrate / 1000).toFixed(0) + " kbps",
    targetMaxSize: maxSizeMB + "MB",
  });

  // Set up canvas
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("Could not create canvas context");
  }

  // Check for supported MIME types (prefer webm, fallback to mp4)
  const mimeType =
    MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : MediaRecorder.isTypeSupported("video/webm")
          ? "video/webm"
          : "video/mp4";

  // Capture canvas stream
  const fps = Math.min(maxFps, 30);
  const canvasStream = canvas.captureStream(fps);

  // Set up MediaRecorder
  const recorder = new MediaRecorder(canvasStream, {
    mimeType,
    videoBitsPerSecond: bitrate,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  // Start recording
  const compressionPromise = new Promise((resolve, reject) => {
    recorder.onstop = () => {
      URL.revokeObjectURL(objectUrl);
      const blob = new Blob(chunks, { type: mimeType });
      console.log("VIDEO: Compression complete", {
        originalSize: file.size,
        compressedSize: blob.size,
        reduction: (
          ((file.size - blob.size) / file.size) *
          100
        ).toFixed(1) + "%",
      });
      resolve(blob);
    };
    recorder.onerror = (e) => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("MediaRecorder error: " + e));
    };
  });

  recorder.start(100); // collect data every 100ms

  // Play the video and draw frames to canvas
  await new Promise((resolve, reject) => {
    const drawFrame = () => {
      if (video.ended || video.paused) {
        resolve();
        return;
      }

      ctx.drawImage(video, 0, 0, width, height);

      if (video.currentTime < duration) {
        requestAnimationFrame(drawFrame);
      } else {
        resolve();
      }
    };

    video.onended = () => resolve();
    video.onerror = () => reject(new Error("Video playback error during compression"));

    video.play().then(drawFrame).catch(reject);
  });

  // Stop recording
  if (recorder.state !== "inactive") {
    recorder.stop();
  }

  return compressionPromise;
}

/**
 * Singleton video manager — ensures only one video plays at a time
 * across the entire app. New videos that want to play will pause
 * any currently-playing video first.
 */

type ManagedVideo = {
  id: string;
  el: HTMLVideoElement;
};

let currentVideo: ManagedVideo | null = null;

export function registerVideo(
  id: string,
  el: HTMLVideoElement
): void {
  // If there's already a different video playing, pause it
  if (currentVideo && currentVideo.id !== id && !currentVideo.el.paused) {
    currentVideo.el.pause();
  }
}

export function playVideo(
  id: string,
  el: HTMLVideoElement
): void {
  // Pause whatever was playing before
  if (currentVideo && currentVideo.id !== id && !currentVideo.el.paused) {
    currentVideo.el.pause();
  }

  currentVideo = { id, el };

  el.play().catch(() => {
    // Autoplay blocked or other issue — ignore
  });
}

export function pauseVideo(id: string): void {
  if (currentVideo && currentVideo.id === id) {
    currentVideo.el.pause();
    currentVideo = null;
  }
}

export function getCurrentlyPlayingId(): string | null {
  return currentVideo?.id ?? null;
}

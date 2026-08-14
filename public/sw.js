const CACHE_NAME = "drip-or-skip-v1";

self.addEventListener("install", (event) => {
  console.log("🔥 Drip or Skip service worker installed");

  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  console.log("🔥 Drip or Skip service worker activated");

  event.waitUntil(
    self.clients.claim()
  );
});

self.addEventListener("fetch", () => {
  // Network-first for now.
  // We'll add proper caching after the core app is stable.
});
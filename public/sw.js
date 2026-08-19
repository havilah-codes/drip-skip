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

// ======================================================
// PUSH NOTIFICATION
// ======================================================

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;

  try {
    payload = event.data.json();
  } catch {
    payload = {
      title: "New message",
      body: event.data.text(),
    };
  }

  const title = payload.title || "Drip or Skip";
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/badge-72x72.png",
    data: payload.data || {},
    tag: payload.data?.chat_id || "default",
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// ======================================================
// NOTIFICATION CLICK — open /messages/<chatId>
// ======================================================

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const chatId = event.notification.data?.chat_id;
  const url = chatId
    ? `/messages/${chatId}`
    : "/messages";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      // If a window for this URL is already open, focus it.
      for (const client of clients) {
        if (
          client.url.includes(url) &&
          "focus" in client
        ) {
          return client.focus();
        }
      }

      // Otherwise open a new window.
      return self.clients.openWindow(url);
    })
  );
});
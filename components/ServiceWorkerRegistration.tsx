"use client";

import { useEffect } from "react";

export default function ServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((registration) => {
            console.log(
              "🔥 Service worker registered:",
              registration.scope
            );
          })
          .catch((error) => {
            console.error(
              "❌ Service worker registration failed:",
              error
            );
          });
      });
    }
  }, []);

  return null;
}
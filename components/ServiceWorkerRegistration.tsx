"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import { resubscribeIfGranted } from "@/lib/push";

/**
 * Send a test notification on app open to verify notifications are working.
 * Only fires once per session to avoid spamming the user.
 */
function sendTestNotification() {
  try {
    if (Notification.permission !== "granted") return;

    new Notification("Drip Skip 🔥", {
      body: "Hello World — notifications are working!",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "test-notification", // prevents duplicate stacking
    });
  } catch (err) {
    console.warn("Test notification failed:", err);
  }
}

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

  // Re-send existing subscription to the server on
  // auth. Does NOT request permission — the
  // NotificationPrompt banner handles that.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (user) => {
        if (user) {
          resubscribeIfGranted();
          // Send test notification to verify push is working
          setTimeout(sendTestNotification, 2000);
        }
      }
    );

    return () => unsubscribe();
  }, []);

  return null;
}
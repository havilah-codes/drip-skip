"use client";

import { useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import { resubscribeIfGranted } from "@/lib/push";

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
        }
      }
    );

    return () => unsubscribe();
  }, []);

  return null;
}
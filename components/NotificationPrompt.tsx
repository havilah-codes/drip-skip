"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  subscribeToPush,
  type PushPermissionResult,
} from "@/lib/push";

const STORAGE_KEY = "notifications_prompted";

/**
 * Returns `true` when the prompt should be hidden:
 *   • already dismissed once, OR
 *   • browser permission is "granted" or "denied".
 */
function shouldHide(): boolean {
  if (typeof window === "undefined") return true;

  if (localStorage.getItem(STORAGE_KEY) === "1") {
    return true;
  }

  if (!("Notification" in window)) return true;

  const perm = Notification.permission;

  return perm === "granted" || perm === "denied";
}

export default function NotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  // Decide on mount whether to show.
  useEffect(() => {
    setVisible(!shouldHide());
  }, []);

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, "1");
    setVisible(false);
  }, []);

  const handleEnable = useCallback(async () => {
    if (subscribing) return;

    setSubscribing(true);

    try {
      const result: PushPermissionResult =
        await subscribeToPush();

      if (result === "granted") {
        // Subscription succeeded — hide permanently.
        localStorage.setItem(STORAGE_KEY, "1");
        setVisible(false);
      } else if (result === "denied") {
        // User denied — hide, don't nag.
        localStorage.setItem(STORAGE_KEY, "1");
        setVisible(false);
      }
      // "default" means the browser prompt was dismissed
      // without a choice — keep showing.
    } catch {
      // Silently ignore; prompt stays visible for retry.
    } finally {
      setSubscribing(false);
    }
  }, [subscribing]);

  if (!visible) return null;

  return (
    <div className="mb-4 flex items-start gap-3 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900">
        <Bell size={18} className="text-zinc-400" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          Stay in the loop
        </p>

        <p className="mt-0.5 text-xs text-zinc-500">
          Get notified when someone messages you, even
          when the app is closed.
        </p>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={subscribing}
            onClick={handleEnable}
            className="px-4 py-1.5 rounded-xl bg-white text-black text-xs font-bold active:scale-95 transition-all disabled:opacity-50"
          >
            {subscribing ? "Enabling…" : "Enable"}
          </button>

          <button
            type="button"
            onClick={dismiss}
            className="px-3 py-1.5 rounded-xl text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Not now
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={dismiss}
        className="mt-0.5 shrink-0 text-zinc-600 hover:text-zinc-400 transition-colors"
        aria-label="Dismiss"
      >
        <X size={16} />
      </button>
    </div>
  );
}

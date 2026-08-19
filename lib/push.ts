import { socket } from "@/lib/socket";

const VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat(
    (4 - (base64String.length % 4)) % 4
  );
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function saveSubscriptionToServer(sub: PushSubscriptionJSON) {
  if (!sub.endpoint || !sub.keys) return;

  socket.emit(
    "save_push_subscription",
    {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
    },
    (res: { ok?: boolean; error?: string }) => {
      if (res?.ok) {
        console.log("📱 Push subscription saved");
      } else {
        console.warn(
          "⚠️ Push subscription save failed:",
          res?.error
        );
      }
    }
  );
}

export type PushPermissionResult = "granted" | "denied" | "default" | "unsupported";

/**
 * Request notification permission, subscribe to push,
 * and persist the subscription on the server.
 *
 * Called by the in-app NotificationPrompt banner —
 * this is the ONLY place that triggers the browser
 * permission dialog.
 */
export async function subscribeToPush(): Promise<PushPermissionResult> {
  if (!("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window)) return "unsupported";
  if (!VAPID_PUBLIC_KEY) {
    console.warn(
      "⚠️ NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set"
    );
    return "unsupported";
  }

  try {
    const permission =
      await Notification.requestPermission();

    if (permission !== "granted") return permission;

    const registration =
      await navigator.serviceWorker.ready;

    // Check for an existing subscription.
    let subscription =
      await registration.pushManager.getSubscription();

    // Create a new one if none exists.
    if (!subscription) {
      subscription =
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey:
            urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
    }

    saveSubscriptionToServer(subscription.toJSON());

    return "granted";
  } catch (err) {
    console.error(
      "❌ SUBSCRIBE TO PUSH FAILED:",
      err instanceof Error ? err.message : err
    );
    return "unsupported";
  }
}

/**
 * If the browser already has push permission granted
 * and an existing subscription exists, re-send it to
 * the server. Does NOT request permission — safe to
 * call on every page load.
 */
export async function resubscribeIfGranted(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  if (!("PushManager" in window)) return;
  if (!VAPID_PUBLIC_KEY) return;

  try {
    if (Notification.permission !== "granted") return;

    const registration =
      await navigator.serviceWorker.ready;

    const subscription =
      await registration.pushManager.getSubscription();

    if (!subscription) return;

    saveSubscriptionToServer(subscription.toJSON());
  } catch (err) {
    console.error(
      "❌ RESUBSCRIBE FAILED:",
      err instanceof Error ? err.message : err
    );
  }
}

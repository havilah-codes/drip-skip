"use strict";

const webPush = require("web-push");
const { supabaseAdmin } = require("./supabase-admin");

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || "mailto:drip-or-skip@example.com";

if (!vapidPublicKey || !vapidPrivateKey) {
  console.warn(
    "⚠️ VAPID keys not configured — push notifications disabled"
  );
} else {
  webPush.setVapidDetails(
    vapidEmail,
    vapidPublicKey,
    vapidPrivateKey
  );
}

/**
 * Send a push notification to every subscription
 * belonging to `profileId`. Silently removes
 * subscriptions that return 404 or 410 (expired /
 * unsubscribed).
 */
async function sendPushToProfile(profileId, payload) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    return;
  }

  const { data: subscriptions, error } =
    await supabaseAdmin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("profile_id", profileId);

  if (error) {
    console.error(
      "❌ PUSH SUBSCRIPTION LOOKUP FAILED:",
      error.message
    );
    return;
  }

  if (!subscriptions || subscriptions.length === 0) {
    return;
  }

  const deadIds = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
      };

      try {
        await webPush.sendNotification(
          pushSubscription,
          JSON.stringify(payload)
        );
      } catch (err) {
        const status = err?.statusCode;

        if (status === 404 || status === 410) {
          deadIds.push(sub.id);
        } else {
          console.error(
            "❌ PUSH SEND ERROR:",
            status,
            err.message
          );
        }
      }
    })
  );

  // Clean up dead subscriptions.
  if (deadIds.length > 0) {
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .in("id", deadIds);

    console.log(
      `🗑️ Removed ${deadIds.length} dead push subscription(s)`
    );
  }
}

module.exports = { sendPushToProfile };

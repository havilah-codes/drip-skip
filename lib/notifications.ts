import { supabase } from "./supabase";
import { socket, connectSocket } from "./socket";

type NotificationType = "drip" | "skip" | "follow" | "comment" | "theme_vote" | "tag";

interface NotifyOptions {
  recipientId: string;
  type: NotificationType;
  postId?: string;
  themeId?: string;
  text?: string;
}

/**
 * Insert a notification into the DB and fire a push via socket.
 * The activity page reads from the notifications table;
 * the socket event triggers the server to send a push if the user is offline.
 */
export async function sendNotification({
  recipientId,
  type,
  postId,
  themeId,
  text,
}: NotifyOptions) {
  // Don't notify yourself — caller should check, but belt-and-suspenders
  // We don't have currentProfileId here, so caller must filter.

  // 1. Insert into notifications table
  const { error } = await supabase.from("notifications").insert({
    user_id: recipientId,
    type,
    post_id: postId || null,
    theme_id: themeId || null,
    text: text || null,
  });

  if (error) {
    console.error("❌ NOTIFICATION INSERT FAILED:", error.message);
    return;
  }

  // 2. Fire socket event for immediate push (if user is offline)
  try {
    if (!socket.connected) await connectSocket();

    const eventMap: Record<NotificationType, string> = {
      drip: "vote_cast",
      skip: "vote_cast",
      follow: "user_followed",
      comment: "comment_added",
      theme_vote: "theme_vote_cast",
      tag: "user_tagged",
    };

    const event = eventMap[type];
    if (!event) return;

    // Build payload matching what the server handlers expect
    const payload: Record<string, string> = {};

    if (type === "drip" || type === "skip") {
      payload.post_owner_id = recipientId;
      payload.vote_type = type;
    } else if (type === "follow") {
      payload.followed_user_id = recipientId;
    } else if (type === "comment") {
      payload.post_owner_id = recipientId;
      payload.comment_text = text || "";
    } else if (type === "theme_vote") {
      payload.theme_owner_id = recipientId;
      payload.vote_type = text || "up";
    } else if (type === "tag") {
      payload.tagged_user_id = recipientId;
      payload.post_id = postId || "";
    }

    socket.emit(event, payload);
  } catch {
    /* socket push is best-effort */
  }
}

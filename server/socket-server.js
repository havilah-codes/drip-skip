const http = require("http");
const { Server } = require("socket.io");

const { adminAuth } = require("./firebase-admin");
const { supabaseAdmin } = require("./supabase-admin");
const { sendPushToProfile } = require("./push");

const PORT = process.env.PORT || 3001;

const httpServer = http.createServer();

const io = new Server(httpServer, {
  cors: {
    origin:
      process.env.SOCKET_CORS_ORIGIN ||
      "http://localhost:3000",
    methods: ["GET", "POST"],
  },

  transports: ["websocket"],
});

// ======================================================
// AUTHENTICATION
// ======================================================

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) {
      return next(
        new Error("Authentication required")
      );
    }

    const decodedToken =
      await adminAuth.verifyIdToken(token);

    const profileId = await getProfileId(
      decodedToken.uid
    );

    if (!profileId) {
      return next(
        new Error("Profile not found")
      );
    }

    socket.user = {
      uid: decodedToken.uid,
      profileId,
    };

    console.log(
      "🔐 SOCKET AUTHENTICATED:",
      decodedToken.uid
    );

    next();
  } catch (error) {
    console.error(
      "❌ SOCKET AUTH FAILED:",
      error instanceof Error
        ? error.message
        : "Unknown authentication error"
    );

    next(
      new Error("Authentication failed")
    );
  }
});

// ======================================================
// DATABASE HELPERS
// ======================================================

async function getProfileId(firebaseUid) {
  const { data, error } =
    await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("firebase_uid", firebaseUid)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id || null;
}

async function isChatParticipant(
  chatId,
  profileId
) {
  const { data, error } =
    await supabaseAdmin
      .from("chat_participants")
      .select("chat_id")
      .eq("chat_id", chatId)
      .eq("user_id", profileId)
      .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

async function getProfileDisplayName(id) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("display_name")
    .eq("id", id)
    .maybeSingle();

  return data?.display_name || null;
}async function getChatParticipantIds(chatId) {
  const { data, error } = await supabaseAdmin
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chatId);

  if (error) {
    throw error;
  }

  return (
    data?.map(
      (participant) =>
        participant.user_id
    ) || []
  );
}

async function getChatIdsForProfile(profileId) {
  const { data, error } = await supabaseAdmin
    .from("chat_participants")
    .select("chat_id")
    .eq("user_id", profileId);

  if (error) {
    throw error;
  }

  return (
    data?.map((row) => row.chat_id) || []
  );
}

async function getOtherParticipantIds(chatId, excludeProfileId) {
  const { data, error } = await supabaseAdmin
    .from("chat_participants")
    .select("user_id")
    .eq("chat_id", chatId)
    .neq("user_id", excludeProfileId);

  if (error) {
    throw error;
  }

  return (
    data?.map((row) => row.user_id) || []
  );
}

// ======================================================
// CONNECTION
// ======================================================

io.on("connection", (socket) => {
  console.log(
    "🟢 SOCKET CONNECTED:",
    socket.id
  );

  const profileId =
    socket.user.profileId;

  // Private room used by /messages
  socket.join(
    `user:${profileId}:chats`
  );

  // Broadcast online status to all chat rooms
  (async () => {
    try {
      const chatIds = await getChatIdsForProfile(profileId);
      for (const chatId of chatIds) {
        const otherIds = await getOtherParticipantIds(chatId, profileId);
        for (const otherId of otherIds) {
          io.to(`user:${otherId}:chats`).emit(
            "user_online",
            { profile_id: profileId, chat_id: chatId }
          );
        }
      }
    } catch (err) {
      console.error("❌ BROADCAST ONLINE ERROR:", err.message || err);
    }
  })();

  // ====================================================
  // HELPERS
  // ====================================================

  function isProfileOnline(id) {
    const room = io.sockets.adapter.rooms.get(
      `user:${id}:chats`
    );
    return room ? room.size > 0 : false;
  }

  // ====================================================
  // JOIN CHAT
  // ====================================================

  socket.on(
    "join_chat",
    async (chatId, callback) => {
      const reply =
        typeof callback === "function"
          ? callback
          : () => {};

      if (
        !socket.user?.uid ||
        !chatId
      ) {
        reply({
          ok: false,
          error: "Invalid chat",
        });

        return;
      }

      try {
        const canJoin =
          await isChatParticipant(
            chatId,
            profileId
          );

        if (!canJoin) {
          console.warn(
            "❌ CHAT MEMBERSHIP DENIED"
          );

          reply({
            ok: false,
            error:
              "Not a chat participant",
          });

          return;
        }

        const room = `chat:${chatId}`;

        socket.join(room);

        console.log(
          `💬 ${socket.id} joined ${room}`
        );

        reply({
          ok: true,
        });
      } catch (error) {
        console.error(
          "❌ CHAT MEMBERSHIP CHECK FAILED:",
          error instanceof Error
            ? error.message
            : "Unknown error"
        );

        reply({
          ok: false,
          error: "Could not join chat",
        });
      }
    }
  );

    // ==========================================
  // SYNC MISSED MESSAGES AFTER RECONNECT
  // ==========================================

  socket.on("sync_messages", async (payload, callback) => {
  const reply =
    typeof callback === "function"
      ? callback
      : () => {};

  try {
    if (!socket.user?.uid) {
      reply({
        ok: false,
        error: "Authentication required",
      });
      return;
    }

    const chatId = payload?.chat_id;
    const after = payload?.after || null;

    if (!chatId) {
      reply({
        ok: false,
        error: "Chat ID is required",
      });
      return;
    }

    const profileId =
      socket.user.profileId ||
      await getProfileId(socket.user.uid);

    if (!profileId) {
      reply({
        ok: false,
        error: "Profile not found",
      });
      return;
    }

    // Verify the authenticated user belongs
    // to this chat.
    const {
      data: participant,
      error: participantError,
    } = await supabaseAdmin
      .from("chat_participants")
      .select("user_id")
      .eq("chat_id", chatId)
      .eq("user_id", profileId)
      .maybeSingle();

    if (participantError) {
      throw participantError;
    }

    if (!participant) {
      reply({
        ok: false,
        error: "Not a chat participant",
      });
      return;
    }

    let query = supabaseAdmin
      .from("messages")
      .select(
        "id, chat_id, sender_id, text, created_at"
      )
      .eq("chat_id", chatId)
      .order("created_at", {
        ascending: true,
      })
      .limit(200);

    if (after) {
      query = query.gt(
        "created_at",
        after
      );
    }

    const {
      data: missedMessages,
      error: messageError,
    } = await query;

    if (messageError) {
      throw messageError;
    }

    console.log(
      "📥 MESSAGE SYNC:",
      chatId,
      "after:",
      after,
      "messages:",
      missedMessages?.length || 0
    );

    reply({
      ok: true,
      messages: missedMessages || [],
    });
  } catch (error) {
    console.error(
      "❌ MESSAGE SYNC SERVER ERROR:",
      error
    );

    reply({
      ok: false,
      error:
        "Could not synchronize messages",
    });
  }
    });

  // ====================================================
  // LEAVE CHAT
  // ====================================================

  socket.on("leave_chat", (chatId) => {
    if (!chatId) {
      return;
    }

    socket.leave(
      `chat:${chatId}`
    );

    console.log(
      `👋 ${socket.id} left chat:${chatId}`
    );
  });

  // ====================================================
  // TYPING START
  // ====================================================

  socket.on(
    "typing_start",
    async (chatId) => {
      if (
        !socket.user?.uid ||
        !chatId
      ) {
        return;
      }

      try {
        const canSendTyping =
          await isChatParticipant(
            chatId,
            profileId
          );

        if (!canSendTyping) {
          return;
        }

        socket
          .to(`chat:${chatId}`)
          .emit("user_typing", {
            chat_id: chatId,
            user_id: profileId,
          });
      } catch (error) {
        console.error(
          "❌ TYPING START ERROR:",
          error instanceof Error
            ? error.message
            : "Unknown error"
        );
      }
    }
  );

  // ====================================================
  // TYPING STOP
  // ====================================================

  socket.on(
    "typing_stop",
    async (chatId) => {
      if (
        !socket.user?.uid ||
        !chatId
      ) {
        return;
      }

      try {
        const canSendTyping =
          await isChatParticipant(
            chatId,
            profileId
          );

        if (!canSendTyping) {
          return;
        }

        socket
          .to(`chat:${chatId}`)
          .emit(
            "user_stopped_typing",
            {
              chat_id: chatId,
              user_id: profileId,
            }
          );
      } catch (error) {
        console.error(
          "❌ TYPING STOP ERROR:",
          error instanceof Error
            ? error.message
            : "Unknown error"
        );
      }
    }
  );

  // ====================================================
  // SEND MESSAGE
  // ====================================================

  socket.on(
    "send_message",
    async (message, callback) => {
      const reply =
        typeof callback === "function"
          ? callback
          : () => {};

      try {
        if (!socket.user?.uid) {
          reply({
            ok: false,
            error:
              "Authentication required",
          });

          return;
        }        const chatId =
          message?.chat_id;

        const text =
          typeof message?.text ===
          "string"
            ? message.text.trim()
            : "";

        const replyTo =
          message?.reply_to || null;

        if (
          !chatId || (!text && !replyTo) || text.length > 2000
        ) {
          reply({
            ok: false,
            error:
              "Invalid message",
          });

          return;
        }

        const canSend =
          await isChatParticipant(
            chatId,
            profileId
          );

        if (!canSend) {
          console.warn(
            "❌ CHAT MEMBERSHIP DENIED"
          );

          reply({
            ok: false,
            error:
              "Not a chat participant",
          });

          return;
        }

        // IMPORTANT:
        // sender_id comes ONLY from the
        // verified socket identity.
        const {
          data: newMessage,
          error: insertError,
        } = await supabaseAdmin
          .from("messages")
          .insert({
            chat_id: chatId,
            sender_id: profileId,
            text: text || null,
            reply_to: replyTo,
          })
          .select(
            "id, chat_id, sender_id, text, created_at, reply_to"
          )
          .single();

        if (insertError) {
          throw insertError;
        }

        const updatedAt =
          new Date().toISOString();

        const {
          error: chatUpdateError,
        } = await supabaseAdmin
          .from("chats")
          .update({
            updated_at: updatedAt,
          })
          .eq("id", chatId);

        if (chatUpdateError) {
          throw chatUpdateError;
        }

        // ================================================
        // CHAT ROOM BROADCAST
        // ================================================

        const room =
          `chat:${chatId}`;

        io.to(room).emit(
          "new_message",
          newMessage
        );

        // In case the sender sends immediately
        // before join_chat finishes.
        if (!socket.rooms.has(room)) {
          socket.emit(
            "new_message",
            newMessage
          );
        }

        // ================================================
        // CHAT LIST BROADCAST
        // ================================================

        const participantIds =
          await getChatParticipantIds(
            chatId
          );

        participantIds.forEach(
          (participantId) => {
            io.to(
              `user:${participantId}:chats`
            ).emit(
              "chat_list_updated",
              {
                chat_id: chatId,
                message: newMessage,
                updated_at: updatedAt,
              }
            );
          }
        );

        // ================================================
        // PUSH NOTIFICATIONS FOR OFFLINE RECIPIENTS
        // ================================================

        const senderName = await getProfileDisplayName(profileId);

        for (const participantId of participantIds) {
          if (participantId === profileId) continue;

          const online = isProfileOnline(participantId);
          console.log(`📱 PUSH CHECK: profile ${participantId} online=${online}`);

          if (online) continue;

          sendPushToProfile(participantId, {
            title: senderName || "New message",
            body: text.length > 120 ? text.slice(0, 120) + "…" : text,
            data: { chat_id: chatId },
          }).catch((err) => {
            console.error(`❌ PUSH SEND FAILED for profile ${participantId}:`, err.message || err);
          });
        }

        reply({
          ok: true,
          message: newMessage,
        });
      } catch (error) {
        console.error(
          "❌ SOCKET MESSAGE ERROR:",
          error instanceof Error
            ? error.message
            : "Unknown error"
        );

        reply({
          ok: false,
          error:
            "Could not send message",
        });
      }
    }
  );

  // ====================================================
  // VOTE CAST — send push to post owner if offline
  // ====================================================

  socket.on(
    "vote_cast",
    async (payload) => {
      try {
        const { post_owner_id, vote_type } = payload || {};

        if (!post_owner_id || !vote_type) return;
        if (post_owner_id === profileId) return; // don't notify yourself

        const voterName = await getProfileDisplayName(profileId);
        const voteLabel = vote_type === "drip" ? "🔥 dripped" : "⏭️ skipped";

        const online = isProfileOnline(post_owner_id);
        if (online) return; // user is in-app, no push needed

        sendPushToProfile(post_owner_id, {
          title: voterName || "Someone",
          body: `${voteLabel} your fit`,
          data: { type: "vote", vote_type },
        }).catch((err) => {
          console.error(`❌ VOTE PUSH FAILED for profile ${post_owner_id}:`, err.message || err);
        });
      } catch (err) {
        console.error("❌ VOTE_CAST ERROR:", err.message || err);
      }
    }
  );

  // ====================================================
  // FOLLOW — send push to followed user if offline
  // ====================================================

  socket.on(
    "user_followed",
    async (payload) => {
      try {
        const { followed_user_id } = payload || {};

        if (!followed_user_id) return;
        if (followed_user_id === profileId) return;

        const followerName = await getProfileDisplayName(profileId);

        const online = isProfileOnline(followed_user_id);
        if (online) return;

        sendPushToProfile(followed_user_id, {
          title: followerName || "Someone",
          body: "started following you",
          data: { type: "follow" },
        }).catch((err) => {
          console.error(`❌ FOLLOW PUSH FAILED for profile ${followed_user_id}:`, err.message || err);
        });
      } catch (err) {
        console.error("❌ USER_FOLLOWED ERROR:", err.message || err);
      }
    }
  );

  // ====================================================
  // COMMENT — send push to post owner if offline
  // ====================================================

  socket.on(
    "comment_added",
    async (payload) => {
      try {
        const { post_owner_id, comment_text } = payload || {};

        if (!post_owner_id) return;
        if (post_owner_id === profileId) return;

        const commenterName = await getProfileDisplayName(profileId);
        const preview = comment_text
          ? (comment_text.length > 80 ? comment_text.slice(0, 80) + "…" : comment_text)
          : "";

        const online = isProfileOnline(post_owner_id);
        if (online) return;

        sendPushToProfile(post_owner_id, {
          title: commenterName || "Someone",
          body: preview ? `commented: ${preview}` : "commented on your fit",
          data: { type: "comment" },
        }).catch((err) => {
          console.error(`❌ COMMENT PUSH FAILED for profile ${post_owner_id}:`, err.message || err);
        });
      } catch (err) {
        console.error("❌ COMMENT_ADDED ERROR:", err.message || err);
      }
    }
  );

  // ====================================================
  // THEME VOTE — send push to theme owner if offline
  // ====================================================

  socket.on(
    "theme_vote_cast",
    async (payload) => {
      try {
        const { theme_owner_id, vote_type } = payload || {};

        if (!theme_owner_id) return;
        if (theme_owner_id === profileId) return;

        const voterName = await getProfileDisplayName(profileId);
        const voteLabel = vote_type === "up" ? "upvoted" : "downvoted";

        const online = isProfileOnline(theme_owner_id);
        if (online) return;

        sendPushToProfile(theme_owner_id, {
          title: voterName || "Someone",
          body: `${voteLabel} your challenge theme`,
          data: { type: "theme_vote" },
        }).catch((err) => {
          console.error(`❌ THEME VOTE PUSH FAILED for profile ${theme_owner_id}:`, err.message || err);
        });
      } catch (err) {
        console.error("❌ THEME_VOTE_CAST ERROR:", err.message || err);
      }
    }
  );

  // ====================================================
  // DISCONNECT
  // ====================================================

  // ====================================================
  // SAVE PUSH SUBSCRIPTION
  // ====================================================

  socket.on(
    "save_push_subscription",
    async (subscription, callback) => {
      const reply =
        typeof callback === "function"
          ? callback
          : () => {};

      try {
        if (!socket.user?.uid) {
          reply({ ok: false, error: "Auth required" });
          return;
        }

        const { endpoint, keys } = subscription || {};

        if (!endpoint || !keys?.p256dh || !keys?.auth) {
          reply({ ok: false, error: "Invalid subscription" });
          return;
        }

        const { error } = await supabaseAdmin
          .from("push_subscriptions")
          .upsert(
            {
              profile_id: profileId,
              endpoint,
              p256dh: keys.p256dh,
              auth: keys.auth,
            },
            { onConflict: "endpoint" }
          );

        if (error) {
          console.error("❌ PUSH SUBSCRIPTION SAVE ERROR:", error.message, error.code);
          throw error;
        }

        console.log("📱 PUSH SUBSCRIPTION SAVED for profile", profileId, "endpoint", endpoint.slice(0, 40) + "...");

        reply({ ok: true });
      } catch (err) {
        console.error("❌ SAVE PUSH SUBSCRIPTION ERROR:", err.message);
        reply({ ok: false, error: "Could not save subscription" });
      }
    }
  );

  // ====================================================
  // DISCONNECT
  // ====================================================

  socket.on(
    "disconnect",
    async (reason) => {
      console.log(
        "🔴 SOCKET DISCONNECTED:",
        socket.id,
        reason
      );

      // Broadcast offline status to all chat rooms
      try {
        const chatIds = await getChatIdsForProfile(profileId);
        for (const chatId of chatIds) {
          const otherIds = await getOtherParticipantIds(chatId, profileId);
          for (const otherId of otherIds) {
            io.to(`user:${otherId}:chats`).emit(
              "user_offline",
              { profile_id: profileId, chat_id: chatId }
            );
          }
        }
      } catch (err) {
        console.error("❌ BROADCAST OFFLINE ERROR:", err.message || err);
      }
    }
  );

  // ====================================================
  // GET ONLINE STATUS
  // ====================================================

  socket.on(
    "get_online_status",
    async (payload, callback) => {
      const reply =
        typeof callback === "function"
          ? callback
          : () => {};

      try {
        const targetId = payload?.profile_id;
        if (!targetId) {
          reply({ online: false });
          return;
        }

        reply({ online: isProfileOnline(targetId) });
      } catch (err) {
        console.error("❌ GET ONLINE STATUS ERROR:", err.message || err);
        reply({ online: false });
      }
    }
  );
});

// ======================================================
// START SERVER
// ======================================================

httpServer.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `🚀 Socket.IO server running on port ${PORT}`
    );
  }
);
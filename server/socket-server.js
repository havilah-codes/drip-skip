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
}

async function getChatParticipantIds(chatId) {
  const { data, error } =
    await supabaseAdmin
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
        }

        const chatId =
          message?.chat_id;

        const text =
          typeof message?.text ===
          "string"
            ? message.text.trim()
            : "";

        if (
          !chatId ||
          !text ||
          text.length > 2000
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
            text,
          })
          .select(
            "id, chat_id, sender_id, text, created_at"
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
    (reason) => {
      console.log(
        "🔴 SOCKET DISCONNECTED:",
        socket.id,
        reason
      );
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
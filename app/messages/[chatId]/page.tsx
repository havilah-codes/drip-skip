"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { useParams, useRouter } from "next/navigation";

// import { ArrowLeft, Send } from "lucide-react";

import { ArrowLeft, Send, Image as ImageIcon, Smile, MoreVertical } from "lucide-react";

import SharedPostCard, { extractPostIdFromUrl } from "@/components/SharedPostCard";

import {
  onAuthStateChanged,
  type User,
} from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";

import {
  connectSocket,
  refreshSocketToken,
  socket,
} from "@/lib/socket";

import { supabase } from "@/lib/supabase";

import { syncProfile } from "@/lib/syncProfile";

type Message = {
  id: string;
  chat_id: string;
  sender_id: string;
  text: string;
  created_at: string;
};

type OtherProfile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

function deduplicateMessages(
  messages: Message[]
) {
  const uniqueMessages =
    new Map<string, Message>();

  for (const message of messages) {
    if (!message.id) {
      continue;
    }

    uniqueMessages.set(
      message.id,
      message
    );
  }

  return Array.from(
    uniqueMessages.values()
  ).sort(
    (first, second) =>
      new Date(
        first.created_at
      ).getTime() -
      new Date(
        second.created_at
      ).getTime()
  );
}

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();

  const chatId =
    typeof params?.chatId === "string"
      ? params.chatId
      : null;

  const [, setCurrentUser] =
    useState<User | null>(null);

  const [
    currentProfileId,
    setCurrentProfileId,
  ] = useState<string | null>(null);

  const [messages, setMessages] =
    useState<Message[]>([]);

  const [
    otherProfile,
    setOtherProfile,
  ] =
    useState<OtherProfile | null>(
      null
    );

  const [messageText, setMessageText] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [sending, setSending] =
    useState(false);

  const [
    isOtherUserTyping,
    setIsOtherUserTyping,
  ] = useState(false);

  const [socketOnline, setSocketOnline] =
    useState(socket.connected);

  const [
    otherUserOnline,
    setOtherUserOnline,
  ] = useState(false);

  const typingTimeoutRef =
    useRef<ReturnType<
      typeof setTimeout
    > | null>(null);

  const isTypingRef =
    useRef(false);

  const messagesEndRef =
    useRef<HTMLDivElement | null>(
      null
    );

  const textareaRef =
    useRef<HTMLTextAreaElement | null>(
      null
    );

  const reconnectSyncRef =
    useRef(false);

  const messagesRef = useRef<Message[]>([]);
      useEffect(() => {
        messagesRef.current = messages;
      }, [messages]);

  const socketRefreshAttemptedRef = useRef(false);

  // ======================================================
  // AUTHENTICATION
  // ======================================================

  useEffect(() => {
    let isMounted = true;

    const unsubscribe =
      onAuthStateChanged(
        firebaseAuth,
        async (user) => {
          if (!isMounted) {
            return;
          }

          setCurrentUser(user);

          if (!user) {
            router.replace("/login");
            return;
          }

          try {
            const profile =
              await syncProfile(user);

            if (
              isMounted &&
              profile?.id
            ) {
              setCurrentProfileId(
                profile.id
              );
            }
          } catch (error) {
            console.error(
              "❌ PROFILE SYNC ERROR:",
              error
            );
          }
        }
      );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router]);

  // ======================================================
  // MARK CHAT AS READ
  // ======================================================

  const markChatAsRead =
    useCallback(async () => {
      if (
        !chatId ||
        !currentProfileId
      ) {
        return;
      }

      const { error } =
        await supabase
          .from(
            "chat_participants"
          )
          .update({
            last_read_at:
              new Date().toISOString(),
          })
          .eq(
            "chat_id",
            chatId
          )
          .eq(
            "user_id",
            currentProfileId
          );

      if (error) {
        console.error(
          "❌ MARK CHAT READ ERROR:",
          error
        );
      }
    }, [
      chatId,
      currentProfileId,
    ]);

  // ======================================================
  // LOAD CHAT
  // ======================================================

  const loadChat = useCallback(
    async (
      showLoading = true
    ) => {
      if (
        !currentProfileId ||
        !chatId
      ) {
        return;
      }

      if (showLoading) {
        setLoading(true);
      }

      try {
        // ==============================================
        // VERIFY MEMBERSHIP
        // ==============================================

        const {
          data: myParticipant,
          error:
            myParticipantError,
        } = await supabase
          .from(
            "chat_participants"
          )
          .select("user_id")
          .eq(
            "chat_id",
            chatId
          )
          .eq(
            "user_id",
            currentProfileId
          )
          .maybeSingle();

        if (myParticipantError) {
          throw myParticipantError;
        }

        if (!myParticipant) {
          router.replace("/messages");
          return;
        }

        // ==============================================
        // LOAD OTHER PARTICIPANT
        // ==============================================

        const {
          data: participants,
          error:
            participantError,
        } = await supabase
          .from(
            "chat_participants"
          )
          .select(`
            user_id,
            profiles (
              id,
              username,
              display_name,
              avatar_url
            )
          `)
          .eq(
            "chat_id",
            chatId
          )
          .neq(
            "user_id",
            currentProfileId
          );

        if (participantError) {
          throw participantError;
        }

        if (
          participants &&
          participants.length > 0
        ) {
          const rawProfile =
            participants[0]?.profiles;

          const profileData =
            Array.isArray(rawProfile)
              ? rawProfile[0]
              : rawProfile;

          if (profileData) {
            setOtherProfile(
              profileData as OtherProfile
            );
          }
        }

        // ==============================================
        // LOAD MESSAGES
        // ==============================================

        const {
          data: messageData,
          error: messageError,
        } = await supabase
          .from("messages")
          .select(
            "id, chat_id, sender_id, text, created_at"
          )
          .eq(
            "chat_id",
            chatId
          )
          .order(
            "created_at",
            {
              ascending: true,
            }
          );

        if (messageError) {
          throw messageError;
        }

        setMessages(
          deduplicateMessages(
            (messageData as Message[]) ||
              []
          )
        );

        await markChatAsRead();
      } catch (error) {
        console.error(
          "❌ CHAT LOAD ERROR:",
          error
        );
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [
      chatId,
      currentProfileId,
      router,
      markChatAsRead,
    ]
  );

  useEffect(() => {
    loadChat(true);
  }, [loadChat]);

  // ======================================================
  // RECOVER MISSED MESSAGES
  // ======================================================

    const syncMissedMessages = useCallback(async () => {
      if (!chatId || !currentProfileId) {
        return;
      }

      if (!socket.connected) {
        return;
      }

      try {
        const lastMessage =
          messagesRef.current[
            messagesRef.current.length - 1
          ];

        const after =
          lastMessage?.created_at || null;

        console.log(
          "🔄 SYNCING MISSED MESSAGES:",
          {
            chatId,
            after,
          }
        );

        const result = await new Promise<{
          ok: boolean;
          messages?: Message[];
          error?: string;
        }>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            reject(
              new Error(
                "Message sync timed out"
              )
            );
          }, 10000);

          socket.timeout(10000).emit(
            "sync_messages",
            {
              chat_id: chatId,
              after,
            },
            (
              error: Error | null,
              response?: {
                ok: boolean;
                messages?: Message[];
                error?: string;
              }
            ) => {
              window.clearTimeout(timeout);

              if (error) {
                reject(error);
                return;
              }

              if (!response) {
                reject(
                  new Error(
                    "No sync response received"
                  )
                );
                return;
              }

              resolve(response);
            }
          );
        });

        if (!result.ok) {
          throw new Error(
            result.error ||
              "Could not synchronize messages"
          );
        }

        if (
          result.messages &&
          result.messages.length > 0
        ) {
          console.log(
            "📥 MISSED MESSAGES RECEIVED:",
            result.messages.length
          );

          setMessages((current) =>
            deduplicateMessages([
              ...current,
              ...result.messages!,
            ])
          );
        }
      } catch (error) {
        console.error(
          "❌ MISSED MESSAGE SYNC ERROR:",
          error
        );
      }
    }, [
      chatId,
      currentProfileId,
    ]);

  // ======================================================
  // SOCKET.IO
  // ======================================================

  useEffect(() => {
    if (
      !chatId ||
      !currentProfileId
    ) {
      return;
    }

    const handleConnect = async () => {
      socketRefreshAttemptedRef.current = false;

      console.log(
        "🟢 SOCKET CONNECTED:",
        socket.id
      );

      // Update socket state so the send button enables properly
      setSocketOnline(true);

      // Rejoin the chat room after EVERY connection.
      socket.emit("join_chat", chatId);

      // Give the server a moment to process the room join,
      // then synchronize anything we missed while disconnected.
      await new Promise((resolve) =>
        setTimeout(resolve, 100)
      );

      await syncMissedMessages();

      await markChatAsRead();

      // Query other user's online status
      if (otherProfile?.id) {
        socket.emit(
          "get_online_status",
          { profile_id: otherProfile.id },
          (response: { online: boolean }) => {
            setOtherUserOnline(response?.online || false);
          }
        );
      }
    };

    const handleDisconnect = (
      reason: string
    ) => {
      console.warn(
        "🔴 CHAT SOCKET DISCONNECTED:",
        reason
      );

      setSocketOnline(false);

      setIsOtherUserTyping(false);

      if (
        typingTimeoutRef.current
      ) {
        clearTimeout(
          typingTimeoutRef.current
        );

        typingTimeoutRef.current =
          null;
      }

      isTypingRef.current =
        false;
    };

    const handleConnectError =
      async (error: Error) => {
        console.error(
          "❌ CHAT SOCKET ERROR:",
          error.message
        );

        setSocketOnline(false);

        try {
          await refreshSocketToken();
        } catch (refreshError) {
          console.error(
            "❌ SOCKET TOKEN REFRESH FAILED:",
            refreshError instanceof Error
              ? refreshError.message
              : "Unknown error"
          );
        }
      };

    const handleNewMessage = (
      message: Message
    ) => {
      if (
        message.chat_id !== chatId
      ) {
        return;
      }

      setMessages(
        (current) =>
          deduplicateMessages([
            ...current,
            message,
          ])
      );

      // If we're actively viewing the chat,
      // keep it marked as read.
      markChatAsRead();
    };

    const handleUserTyping = (
      payload: {
        chat_id: string;
        user_id: string;
      }
    ) => {
      if (
        payload.chat_id === chatId &&
        payload.user_id !==
          currentProfileId
      ) {
        setIsOtherUserTyping(true);
      }
    };

    const handleUserStoppedTyping = (
      payload: {
        chat_id: string;
        user_id: string;
      }
    ) => {
      if (
        payload.chat_id === chatId &&
        payload.user_id !==
          currentProfileId
      ) {
        setIsOtherUserTyping(false);
      }
    };

    const handleUserOnline = (
      payload: {
        profile_id: string;
        chat_id: string;
      }
    ) => {
      if (
        payload.chat_id === chatId
      ) {
        setOtherUserOnline(true);
      }
    };

    const handleUserOffline = (
      payload: {
        profile_id: string;
        chat_id: string;
      }
    ) => {
      if (
        payload.chat_id === chatId
      ) {
        setOtherUserOnline(false);
      }
    };

    socket.on(
      "connect",
      handleConnect
    );

    socket.on(
      "disconnect",
      handleDisconnect
    );

    socket.on(
      "connect_error",
      handleConnectError
    );

    socket.on(
      "new_message",
      handleNewMessage
    );

    socket.on(
      "user_typing",
      handleUserTyping
    );

    socket.on(
      "user_stopped_typing",
      handleUserStoppedTyping
    );

    socket.on(
      "user_online",
      handleUserOnline
    );

    socket.on(
      "user_offline",
      handleUserOffline
    );

    if (socket.connected) {
      handleConnect();
    } else {
      connectSocket().catch(
        (error) => {
          console.error(
            "❌ CHAT SOCKET CONNECT ERROR:",
            error instanceof Error
              ? error.message
              : "Unknown error"
          );
        }
      );
    }

    // Query online status on connect
    const queryOnlineStatus = () => {
      if (otherProfile?.id) {
        socket.emit(
          "get_online_status",
          { profile_id: otherProfile.id },
          (response: { online: boolean }) => {
            setOtherUserOnline(response?.online || false);
          }
        );
      }
    };

    if (socket.connected) {
      queryOnlineStatus();
    }

    return () => {
      socket.emit(
        "typing_stop",
        chatId
      );

      socket.emit(
        "leave_chat",
        chatId
      );

      socket.off(
        "connect",
        handleConnect
      );

      socket.off(
        "disconnect",
        handleDisconnect
      );

      socket.off(
        "connect_error",
        handleConnectError
      );

      socket.off(
        "new_message",
        handleNewMessage
      );

      socket.off(
        "user_typing",
        handleUserTyping
      );

      socket.off(
        "user_stopped_typing",
        handleUserStoppedTyping
      );

      socket.off(
        "user_online",
        handleUserOnline
      );

      socket.off(
        "user_offline",
        handleUserOffline
      );

      if (
        typingTimeoutRef.current
      ) {
        clearTimeout(
          typingTimeoutRef.current
        );

        typingTimeoutRef.current =
          null;
      }

      isTypingRef.current =
        false;
    };
  }, [
    chatId,
    currentProfileId,
    syncMissedMessages,
    markChatAsRead,
    otherProfile?.id,
  ]);

  // ======================================================
  // AUTO SCROLL
  // ======================================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView(
      {
        behavior: "smooth",
      }
    );
  }, [messages]);

  // ======================================================
  // TEXTAREA
  // ======================================================

  const handleTextareaInput = (
    e: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    const value =
      e.target.value;

    setMessageText(value);

    if (textareaRef.current) {
      textareaRef.current.style.height =
        "auto";

      textareaRef.current.style.height =
        `${Math.min(
          textareaRef.current
            .scrollHeight,
          128
        )}px`;
    }

    if (
      !chatId ||
      !socket.connected
    ) {
      return;
    }

    if (!value.trim()) {
      if (
        isTypingRef.current
      ) {
        socket.emit(
          "typing_stop",
          chatId
        );

        isTypingRef.current =
          false;
      }

      if (
        typingTimeoutRef.current
      ) {
        clearTimeout(
          typingTimeoutRef.current
        );

        typingTimeoutRef.current =
          null;
      }

      return;
    }

    if (
      !isTypingRef.current
    ) {
      socket.emit(
        "typing_start",
        chatId
      );

      isTypingRef.current =
        true;
    }

    if (
      typingTimeoutRef.current
    ) {
      clearTimeout(
        typingTimeoutRef.current
      );
    }

    typingTimeoutRef.current =
      setTimeout(() => {
        if (
          socket.connected &&
          isTypingRef.current
        ) {
          socket.emit(
            "typing_stop",
            chatId
          );
        }

        isTypingRef.current =
          false;

        typingTimeoutRef.current =
          null;
      }, 1500);
  };

  // ======================================================
  // SEND MESSAGE
  // ======================================================

  const handleSendMessage =
    async (
      event?: FormEvent
    ) => {
      event?.preventDefault();

      const text =
        messageText.trim();

      if (
        !text ||
        !currentProfileId ||
        !chatId ||
        sending
      ) {
        return;
      }

      if (!socket.connected) {
        try {
          await connectSocket();
        } catch {
          alert(
            "Could not connect to the chat server. Please try again."
          );
          return;
        }

        if (!socket.connected) {
          alert(
            "Could not connect to the chat server. Please try again."
          );
          return;
        }
      }

      setSending(true);

      if (
        typingTimeoutRef.current
      ) {
        clearTimeout(
          typingTimeoutRef.current
        );

        typingTimeoutRef.current =
          null;
      }

      if (
        isTypingRef.current
      ) {
        socket.emit(
          "typing_stop",
          chatId
        );
      }

      isTypingRef.current =
        false;

      try {
        const sendResult =
          await new Promise<{
            ok: boolean;
            error?: string;
            message?: Message;
          }>(
            (
              resolve,
              reject
            ) => {
              const timeout =
                window.setTimeout(
                  () => {
                    reject(
                      new Error(
                        "Chat server did not acknowledge the message"
                      )
                    );
                  },
                  10000
                );

              socket
                .timeout(10000)
                .emit(
                  "send_message",
                  {
                    chat_id:
                      chatId,
                    text,
                  },
                  (
                    error: Error | null,
                    result?: {
                      ok: boolean;
                      error?: string;
                      message?: Message;
                    }
                  ) => {
                    window.clearTimeout(
                      timeout
                    );

                    if (
                      error ||
                      !result
                    ) {
                      reject(
                        error ||
                          new Error(
                            "Chat server did not acknowledge the message"
                          )
                      );

                      return;
                    }

                    resolve(
                      result
                    );
                  }
                );
            }
          );

        if (!sendResult.ok) {
          throw new Error(
            sendResult.error ||
              "Could not send message"
          );
        }

        setMessageText("");

        if (
          textareaRef.current
        ) {
          textareaRef.current.style.height =
            "auto";
        }

        await markChatAsRead();
      } catch (error) {
        console.error(
          "❌ SEND MESSAGE ERROR:",
          error
        );

        alert(
          "Could not send your message. Please try again."
        );
      } finally {
        setSending(false);
      }
    };

  // ======================================================
  // ENTER TO SEND
  // ======================================================

  const handleKeyDown = (
    event: KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      handleSendMessage();
    }
  };

  // ======================================================
  // TIME
  // ======================================================

  const formatTime = (
    dateString: string
  ) => {
    try {
      return new Date(
        dateString
      ).toLocaleTimeString(
        [],
        {
          hour: "numeric",
          minute: "2-digit",
        }
      );
    } catch {
      return "";
    }
  };

  // ======================================================
  // LOADING
  // ======================================================

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-zinc-500 animate-pulse">
          Loading chat...
        </p>
      </main>
    );
  }

  const avatar =
    otherProfile?.avatar_url ||
    "/default-avatar.png";

  // ======================================================
  // PAGE
  // ======================================================

  return (
    <main className="h-screen w-full bg-zinc-950 text-white flex flex-col overflow-hidden select-none">
      {/* HEADER */}
      <div className="shrink-0 z-40 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-2xl">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/messages")}
              className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800/60 active:scale-95 transition-all"
              aria-label="Back to chats"
            >
              <ArrowLeft size={20} />
            </button>

            {otherProfile && (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={avatar}
                    alt={otherProfile.display_name}
                    className="w-10 h-10 rounded-full object-cover ring-2 ring-zinc-800"
                  />
                  <span
                    className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-zinc-950 transition-colors duration-300 ${
                      otherUserOnline
                        ? "bg-green-500"
                        : "bg-zinc-600"
                    }`}
                  />
                </div>

                <div className="min-w-0">
                  <p className="font-semibold text-sm leading-tight truncate">
                    {otherProfile.display_name}
                  </p>
                  <p className="text-xs text-zinc-400 truncate">
                    @{otherProfile.username}
                  </p>
                </div>
              </div>
            )}
          </div>

          <button className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-all">
            <MoreVertical size={18} />
          </button>
        </div>
      </div>

      {/* MESSAGES (Strict vertical-only scroll, no horizontal overflow) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-28 text-center">
              <div className="relative mb-4">
                <img
                  src={avatar}
                  alt={otherProfile?.display_name || "User"}
                  className="w-20 h-20 rounded-full object-cover ring-4 ring-zinc-800/80 shadow-2xl"
                />
                <span className="absolute -bottom-1 -right-1 text-xl">👋</span>
              </div>

              <h2 className="font-bold text-lg text-white">
                Say hello to {otherProfile?.display_name || "them"}
              </h2>

              <p className="text-xs text-zinc-400 mt-1 max-w-xs leading-relaxed">
                Send a message to break the ice and start rating fits together.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) => {
                const isMine = message.sender_id === currentProfileId;

                return (
                  <div
                    key={message.id}
                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`w-fit max-w-[75%] sm:max-w-[450px] min-w-0 flex flex-col ${
                        isMine ? "items-end" : "items-start"
                      }`}
                    >
                      {extractPostIdFromUrl(message.text) ? (
                        <SharedPostCard postId={extractPostIdFromUrl(message.text)!} />
                      ) : (
                        <div
                          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words break-all [overflow-wrap:anywhere] whitespace-pre-wrap shadow-xs ${
                            isMine
                              ? "bg-gradient-to-tr from-white to-zinc-200 text-black font-medium rounded-br-xs"
                              : "bg-zinc-900 border border-zinc-800/80 text-zinc-100 rounded-bl-xs"
                          }`}
                        >
                          {message.text}
                        </div>
                      )}

                      <span className="text-[10px] font-medium text-zinc-500 mt-1.5 px-1 tracking-tight">
                        {formatTime(message.created_at)}
                      </span>
                    </div>
                  </div>
                );
              })}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* COMPOSER WRAPPER */}
      <div className="shrink-0 relative border-t border-zinc-800/60 bg-zinc-950/80 backdrop-blur-2xl pb-safe">
        {/* TYPING INDICATOR */}
        {isOtherUserTyping && otherProfile && (
          <div className="absolute -top-10 left-0 right-0 z-20 pointer-events-none flex justify-start max-w-2xl mx-auto px-4">
            <div className="pointer-events-auto inline-flex items-center gap-2 bg-zinc-900/90 border border-zinc-800 px-3 py-1 rounded-full shadow-lg">
              <img
                src={avatar}
                alt="Typing..."
                className="w-5 h-5 rounded-full object-cover"
              />
              <span className="text-xs text-zinc-400 font-medium">
                {otherProfile.display_name.split(" ")[0]} is typing
              </span>
              <div className="flex items-center gap-1 ml-1">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {/* INPUT FORM */}
        <form onSubmit={handleSendMessage} className="max-w-2xl mx-auto p-3">
          <div className="flex items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900/80 p-2 focus-within:border-zinc-700 focus-within:ring-1 focus-within:ring-zinc-700 transition-all">
            <button
              type="button"
              className="p-2 text-zinc-400 hover:text-white transition-colors shrink-0"
            >
              <ImageIcon size={18} />
            </button>

            <textarea
              ref={textareaRef}
              value={messageText}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Message..."
              rows={1}
              maxLength={2000}
              className="flex-1 min-w-0 max-h-32 resize-none bg-transparent py-2 text-sm text-white placeholder:text-zinc-500 outline-none"
            />

            <button
              type="submit"
              disabled={!messageText.trim() || sending}
              className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                messageText.trim() && !sending
                  ? "bg-white text-black font-semibold shadow-md"
                  : "bg-zinc-800 text-zinc-500"
              }`}
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
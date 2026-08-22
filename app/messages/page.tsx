"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import BottomNav from "@/components/BottomNav";
import {
  ArrowLeft,
  Search,
  MessageCircle,
} from "lucide-react";
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

type ChatParticipantWithProfile = {
  chat_id: string;
  user_id: string;
  profiles: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

type ChatPreview = {
  id: string;
  updated_at: string;
  last_read_at: string | null;
  unread_count: number;
  profile: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
};

type ChatListUpdate = {
  chat_id: string;
  message: {
    id: string;
    chat_id: string;
    sender_id: string;
    text: string;
    created_at: string;
  };
  updated_at: string;
};

export default function MessagesPage() {
  const router = useRouter();

  const [currentUser, setCurrentUser] =
    useState<User | null>(null);

  const [currentProfileId, setCurrentProfileId] =
    useState<string | null>(null);

  const [chats, setChats] =
    useState<ChatPreview[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const socketRefreshAttemptedRef =
    useRef(false);

  const receivedMessageIdsRef =
    useRef(new Set<string>());

  // ==========================================
  // AUTH
  // ==========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (user) => {
        setCurrentUser(user);

        if (!user) {
          setLoading(false);
          router.replace("/login");
          return;
        }

        try {
          const profile = await syncProfile(user);

          if (profile?.id) {
            setCurrentProfileId(profile.id);
          }
        } catch (error) {
          console.error(
            "❌ PROFILE SYNC ERROR:",
            error
          );
          setLoading(false);
        }
      }
    );

    return () => unsubscribe();
  }, [router]);

  // ==========================================
  // LOAD CHATS
  // ==========================================

  const loadChats = useCallback(
    async (showLoading = false) => {
      if (!currentProfileId) return;

      if (showLoading) {
        setLoading(true);
      }

      try {
        console.log("💬 LOADING CHATS");

        const {
          data: participantData,
          error: participantError,
        } = await supabase
          .from("chat_participants")
          .select(
            "chat_id, last_read_at"
          )
          .eq(
            "user_id",
            currentProfileId
          );

        if (participantError) {
          throw participantError;
        }

        const chatIds =
          participantData?.map(
            (item) => item.chat_id
          ) || [];

        if (chatIds.length === 0) {
          setChats([]);
          return;
        }

        const {
          data: chatData,
          error: chatError,
        } = await supabase
          .from("chats")
          .select(
            "id, updated_at"
          )
          .in("id", chatIds)
          .order(
            "updated_at",
            {
              ascending: false,
            }
          );

        if (chatError) {
          throw chatError;
        }

        const {
          data: participants,
          error: participantsError,
        } = await supabase
          .from("chat_participants")
          .select(`
            chat_id,
            user_id,
            profiles (
              id,
              username,
              display_name,
              avatar_url
            )
          `)
          .in(
            "chat_id",
            chatIds
          )
          .neq(
            "user_id",
            currentProfileId
          );

        if (participantsError) {
          throw participantsError;
        }

        const previews: ChatPreview[] = [];

        for (const chat of chatData || []) {
          const participant =
            participants?.find(
              (item) =>
                item.chat_id === chat.id
            ) as
              | ChatParticipantWithProfile
              | undefined;

          if (!participant?.profiles) {
            continue;
          }

          const myParticipant =
            participantData?.find(
              (item) =>
                item.chat_id === chat.id
            );

          const lastReadAt =
            myParticipant?.last_read_at ||
            null;

          let unreadCount = 0;

          const unreadQuery =
            supabase
              .from("messages")
              .select("id", {
                count: "exact",
                head: true,
              })
              .eq(
                "chat_id",
                chat.id
              )
              .neq(
                "sender_id",
                currentProfileId
              );

          const {
            count,
            error: unreadError,
          } = lastReadAt
            ? await unreadQuery.gt(
                "created_at",
                lastReadAt
              )
            : await unreadQuery;

          if (unreadError) {
            console.error(
              "❌ UNREAD COUNT ERROR:",
              unreadError
            );
          } else {
            unreadCount = count || 0;
          }

          previews.push({
            id: chat.id,
            updated_at:
              chat.updated_at,
            last_read_at:
              lastReadAt,
            unread_count:
              unreadCount,
            profile:
              participant.profiles,
          });
        }

        setChats(previews);

        console.log(
          "✅ CHATS LOADED:",
          previews
        );
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
    [currentProfileId]
  );

  // ======================================================
  // REFRESH CHATS WHEN PAGE BECOMES VISIBLE
  // ======================================================

  useEffect(() => {
    if (!currentProfileId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadChats();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
    };
  }, [currentProfileId, loadChats]);

  // Initial load
  useEffect(() => {
    if (!currentProfileId) return;

    loadChats(true);
  }, [
    currentProfileId,
    loadChats,
  ]);

  // ==========================================
  // SOCKET.IO CHAT LIST
  // ==========================================

  useEffect(() => {
    if (!currentProfileId) return;

    const wasConnected = socket.connected;

    const handleConnect = () => {
      socketRefreshAttemptedRef.current = false;

      console.log(
        "🟢 CHAT LIST SOCKET CONNECTED:",
        socket.id
      );

      // This runs once on reconnect to recover any event missed while offline.
      loadChats(false);
    };

    const handleConnectError = async (error: Error) => {
      console.error(
        "❌ CHAT LIST SOCKET AUTH ERROR:",
        error.message
      );

      if (socketRefreshAttemptedRef.current) {
        return;
      }

      socketRefreshAttemptedRef.current = true;

      try {
        await refreshSocketToken();
      } catch (refreshError) {
        console.error(
          "❌ CHAT LIST TOKEN REFRESH FAILED:",
          refreshError instanceof Error
            ? refreshError.message
            : "Unknown error"
        );
      }
    };

    const handleChatListUpdated = (
      update: ChatListUpdate
    ) => {
      if (!update?.message?.id) return;

      if (
        receivedMessageIdsRef.current.has(
          update.message.id
        )
      ) {
        return;
      }

      receivedMessageIdsRef.current.add(
        update.message.id
      );

      setChats((current) => {
        const existingChat = current.find(
          (chat) => chat.id === update.chat_id
        );

        if (!existingChat) {
          // New chats need their participant/profile data from Supabase.
          loadChats(false);
          return current;
        }

        const unreadCount =
          update.message.sender_id === currentProfileId
            ? existingChat.unread_count
            : existingChat.unread_count + 1;

        return current
          .map((chat) =>
            chat.id === update.chat_id
              ? {
                  ...chat,
                  updated_at: update.updated_at,
                  unread_count: unreadCount,
                }
              : chat
          )
          .sort(
            (first, second) =>
              new Date(
                second.updated_at
              ).getTime() -
              new Date(
                first.updated_at
              ).getTime()
          );
      });
    };

    socket.on("connect", handleConnect);
    socket.on("connect_error", handleConnectError);
    socket.on(
      "chat_list_updated",
      handleChatListUpdated
    );

    if (socket.connected) {
      handleConnect();
    } else {
      connectSocket().catch((error) => {
        console.error(
          "❌ CHAT LIST SOCKET AUTH ERROR:",
          error instanceof Error
            ? error.message
            : "Unknown error"
        );
      });
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      socket.off(
        "chat_list_updated",
        handleChatListUpdated
      );

      if (!wasConnected) {
        socket.disconnect();
      }
    };
  }, [
    currentProfileId,
    loadChats,
  ]);

  // ==========================================
  // FILTER
  // ==========================================

  const filteredChats =
    chats.filter((chat) => {
      const query =
        search.toLowerCase().trim();

      if (!query) return true;

      return (
        chat.profile.display_name
          .toLowerCase()
          .includes(query) ||
        chat.profile.username
          .toLowerCase()
          .includes(query)
      );
    });

  // ==========================================
  // TIME
  // ==========================================

  const getTimeAgo = (
    dateString: string
  ) => {
    const date = new Date(dateString);

    const seconds = Math.floor(
      (Date.now() -
        date.getTime()) /
        1000
    );

    if (seconds < 60) return "now";

    const minutes = Math.floor(
      seconds / 60
    );

    if (minutes < 60) {
      return `${minutes}m`;
    }

    const hours = Math.floor(
      minutes / 60
    );

    if (hours < 24) {
      return `${hours}h`;
    }

    const days = Math.floor(
      hours / 24
    );

    if (days < 7) {
      return `${days}d`;
    }

    return date.toLocaleDateString(
      undefined,
      {
        month: "short",
        day: "numeric",
      }
    );
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-zinc-500 animate-pulse">
          Loading chats...
        </p>
      </main>
    );
  }

  // ==========================================
  // PAGE
  // ==========================================

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-black/85 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
            aria-label="Go back"
          >
            <ArrowLeft size={19} />
          </button>

          <h1 className="text-lg font-bold">
            Chats
          </h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 pb-28">
        {/* SEARCH */}

        <div className="relative mb-5">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500"
          />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search chats..."
            className="w-full h-12 pl-11 pr-4 rounded-2xl border border-zinc-900 bg-zinc-950 text-sm text-white placeholder:text-zinc-600 outline-none focus:border-zinc-700 transition-colors"
          />
        </div>

        {/* EMPTY STATE */}

        {filteredChats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-28 text-center">
            <div className="w-16 h-16 rounded-full bg-zinc-950 border border-zinc-900 flex items-center justify-center mb-5">
              <MessageCircle
                size={26}
                className="text-zinc-600"
              />
            </div>

            <h2 className="font-bold text-lg">
              No chats yet
            </h2>

            <p className="text-sm text-zinc-500 mt-2 max-w-xs">
              Start a conversation by visiting someone's
              profile and tapping Message.
            </p>

            <button
              type="button"
              onClick={() =>
                router.push("/explore")
              }
              className="mt-6 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-bold active:scale-95 transition-all"
            >
              Find people
            </button>
          </div>
        )}

        {/* CHAT LIST */}

        {filteredChats.length > 0 && (
          <div className="space-y-2">
            {filteredChats.map((chat) => {
              const profile = chat.profile;

              const avatar =
                profile.avatar_url ||
                "/default-avatar.png";

              return (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() =>
                    router.push(
                      `/messages/${chat.id}`
                    )
                  }
                  className="w-full flex items-center gap-3 p-3 rounded-2xl border border-transparent hover:border-zinc-900 hover:bg-zinc-950 transition-all text-left active:scale-[0.99]"
                >
                  <img
                    src={avatar}
                    alt={profile.display_name}
                    className="w-12 h-12 rounded-full object-cover border border-zinc-800 shrink-0"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-sm truncate">
                        {profile.display_name}
                      </p>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`text-[11px] ${
                            chat.unread_count > 0
                              ? "text-zinc-300"
                              : "text-zinc-600"
                          }`}
                        >
                          {getTimeAgo(
                            chat.updated_at
                          )}
                        </span>

                        {chat.unread_count > 0 && (
                          <span className="min-w-5 h-5 px-1.5 rounded-full bg-white text-black text-[10px] font-bold flex items-center justify-center">
                            {chat.unread_count > 99
                              ? "99+"
                              : chat.unread_count}
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-zinc-500 truncate mt-1">
                      @{profile.username}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

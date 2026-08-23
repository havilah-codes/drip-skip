"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Share2, MessageCircle, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";

type ChatPreview = {
  chat_id: string;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

type ShareSheetProps = {
  postId: string;
  postText?: string | null;
  currentProfileId: string | null;
  isOpen: boolean;
  onClose: () => void;
};

export default function ShareSheet({
  postId,
  postText,
  currentProfileId,
  isOpen,
  onClose,
}: ShareSheetProps) {
  const [copied, setCopied] = useState(false);
  const [chats, setChats] = useState<ChatPreview[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [sendingTo, setSendingTo] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<Set<string>>(new Set());

  const shareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/post/${postId}`
      : "";

  // =====================================================
  // LOAD CHATS
  // =====================================================

  const loadChats = useCallback(async () => {
    if (!currentProfileId) return;

    setLoadingChats(true);
    try {
      const { data: participantData } = await supabase
        .from("chat_participants")
        .select("chat_id")
        .eq("user_id", currentProfileId);

      const chatIds = participantData?.map((p) => p.chat_id) || [];
      if (chatIds.length === 0) {
        setChats([]);
        return;
      }

      const { data: participants } = await supabase
        .from("chat_participants")
        .select(
          `
          chat_id,
          user_id,
          profiles (
            id,
            username,
            display_name,
            avatar_url
          )
        `
        )
        .in("chat_id", chatIds)
        .neq("user_id", currentProfileId);

      const previews: ChatPreview[] = [];
      for (const p of participants || []) {
        const rawProfile = p.profiles;
        const profile = Array.isArray(rawProfile)
          ? rawProfile[0]
          : rawProfile;

        if (profile) {
          previews.push({
            chat_id: p.chat_id,
            other_user: profile as ChatPreview["other_user"],
          });
        }
      }

      setChats(previews);
    } catch (error) {
      console.error("❌ LOAD CHATS ERROR:", error);
    } finally {
      setLoadingChats(false);
    }
  }, [currentProfileId]);

  useEffect(() => {
    if (isOpen) {
      loadChats();
      setCopied(false);
      setSentTo(new Set());
    }
  }, [isOpen, loadChats]);

  // =====================================================
  // COPY LINK
  // =====================================================

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement("textarea");
      textarea.value = shareUrl;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // =====================================================
  // NATIVE SHARE
  // =====================================================

  const handleNativeShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Drip or Skip",
          text: postText || "Check out this post on Drip or Skip.",
          url: shareUrl,
        });
      }
    } catch {
      // User cancelled or not supported
    }
  };

  // =====================================================
  // SEND TO CHAT
  // =====================================================

  const handleSendToChat = async (chatId: string) => {
    if (sendingTo) return;

    setSendingTo(chatId);
    try {
      const { error } = await supabase.from("messages").insert({
        chat_id: chatId,
        sender_id: currentProfileId,
        text: shareUrl,
      });

      if (error) throw error;

      setSentTo((prev) => new Set(prev).add(chatId));
    } catch (error) {
      console.error("❌ SEND SHARE ERROR:", error);
      alert("Could not send. Please try again.");
    } finally {
      setSendingTo(null);
    }
  };

  // =====================================================
  // RENDER
  // =====================================================

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center">
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* SHEET */}
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-t-3xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* HANDLE */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="font-bold text-sm">Share post</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ACTION BUTTONS */}
        <div className="px-4 py-3 border-b border-zinc-900">
          <div className="flex items-center gap-3">
            {/* Copy Link */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex-1 flex flex-col items-center gap-2 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                {copied ? (
                  <Check size={18} className="text-green-400" />
                ) : (
                  <Copy size={18} className="text-zinc-300" />
                )}
              </div>
              <span className="text-xs font-medium text-zinc-300">
                {copied ? "Copied!" : "Copy link"}
              </span>
            </button>

            {/* Native Share */}
            <button
              type="button"
              onClick={handleNativeShare}
              className="flex-1 flex flex-col items-center gap-2 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 transition-colors"
            >
              <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center">
                <Share2 size={18} className="text-zinc-300" />
              </div>
              <span className="text-xs font-medium text-zinc-300">
                Share
              </span>
            </button>
          </div>
        </div>

        {/* SEND TO CHAT */}
        {currentProfileId && (
          <div className="max-h-72 overflow-y-auto">
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                Send to chat
              </p>

              {loadingChats ? (
                <div className="py-6 text-center text-sm text-zinc-500">
                  Loading chats...
                </div>
              ) : chats.length === 0 ? (
                <div className="py-6 text-center text-sm text-zinc-500">
                  No chats yet
                </div>
              ) : (
                <div className="space-y-1">
                  {chats.map((chat) => {
                    const user = chat.other_user;
                    if (!user) return null;

                    const isSent = sentTo.has(chat.chat_id);
                    const isSending = sendingTo === chat.chat_id;
                    const avatarUrl =
                      user.avatar_url || "/default-avatar.png";

                    return (
                      <button
                        key={chat.chat_id}
                        type="button"
                        onClick={() => handleSendToChat(chat.chat_id)}
                        disabled={isSent || isSending}
                        className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-900 transition-colors disabled:opacity-60"
                      >
                        <img
                          src={avatarUrl}
                          alt={user.display_name}
                          className="w-10 h-10 rounded-full object-cover border border-zinc-800 shrink-0"
                        />
                        <div className="min-w-0 flex-1 text-left">
                          <p className="text-sm font-medium truncate">
                            {user.display_name}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            @{user.username}
                          </p>
                        </div>
                        {isSent ? (
                          <span className="text-xs text-green-400 font-medium shrink-0">
                            Sent
                          </span>
                        ) : isSending ? (
                          <span className="text-xs text-zinc-500 shrink-0">
                            Sending...
                          </span>
                        ) : (
                          <MessageCircle
                            size={18}
                            className="text-zinc-500 shrink-0"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* SAFE AREA */}
        <div className="h-8" />
      </div>
    </div>
  );
}

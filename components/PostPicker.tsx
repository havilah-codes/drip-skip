"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { X, Send, Image as ImageIcon, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { extractVideoFrame } from "@/lib/videoThumbnail";

type PostPreview = {
  id: string;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
};

type PostPickerProps = {
  currentProfileId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSendPost: (post: PostPreview) => void;
};

export default function PostPicker({
  currentProfileId,
  isOpen,
  onClose,
  onSendPost,
}: PostPickerProps) {
  const [posts, setPosts] = useState<PostPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    if (!currentProfileId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("posts")
        .select("id, text, image_url, video_url, created_at")
        .eq("user_id", currentProfileId)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      setPosts((data as PostPreview[]) || []);
    } catch (error) {
      console.error("❌ LOAD POSTS ERROR:", error);
    } finally {
      setLoading(false);
    }
  }, [currentProfileId]);

  useEffect(() => {
    if (isOpen) {
      loadPosts();
    }
  }, [isOpen, loadPosts]);

  const handleSend = async (post: PostPreview) => {
    if (sending) return;
    setSending(post.id);
    try {
      onSendPost(post);
    } finally {
      setSending(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center">
      {/* BACKDROP */}
      <div
        className="absolute inset-0 bg-bg/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* SHEET */}
      <div className="relative w-full max-w-lg bg-bg-raised border border-border-d rounded-t-3xl overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* HANDLE */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <h3 className="font-bold text-sm font-display">Share a post</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <p className="px-4 pb-3 text-xs text-text-t">
          Pick a post to send in this chat
        </p>

        {/* POSTS LIST */}
        <div className="max-h-80 overflow-y-auto">
          {loading ? (
            <div className="py-10 text-center text-sm text-text-t">
              Loading your posts...
            </div>
          ) : posts.length === 0 ? (
            <div className="py-10 text-center text-sm text-text-t">
              You don&apos;t have any posts yet
            </div>
          ) : (
            <div className="space-y-1 px-2 pb-2">
              {posts.map((post) => {
                const isSending = sending === post.id;
                const preview = post.text
                  ? post.text.length > 80
                    ? post.text.slice(0, 77) + "..."
                    : post.text
                  : null;

                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => handleSend(post)}
                    disabled={!!sending}
                    className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-bg-sunken transition-colors disabled:opacity-50 text-left"
                  >
                    {/* Thumbnail */}
                    <div className="w-14 h-14 rounded-lg bg-bg-sunken border border-border-d overflow-hidden shrink-0 flex items-center justify-center">
                      {post.image_url ? (
                        <img
                          src={post.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : post.video_url ? (
                        <VideoThumb src={post.video_url} />
                      ) : (
                        <FileText size={18} className="text-text-m" />
                      )}
                    </div>

                    {/* Text preview */}
                    <div className="min-w-0 flex-1">
                      {preview ? (
                        <p className="text-sm text-text-p line-clamp-2 leading-relaxed">
                          {preview}
                        </p>
                      ) : post.image_url || post.video_url ? (
                        <p className="text-sm text-text-t italic">
                          {post.video_url ? "Video" : "Photo"}
                        </p>
                      ) : (
                        <p className="text-sm text-text-t italic">Post</p>
                      )}
                      <p className="text-[10px] text-text-m mt-1">
                        {new Date(post.created_at).toLocaleDateString(
                          undefined,
                          { month: "short", day: "numeric" }
                        )}
                      </p>
                    </div>

                    {/* Send icon */}
                    <div className="shrink-0 mt-1">
                      {isSending ? (
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center">
                          <Send size={14} className="text-text-s animate-pulse" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-text-s group-hover:text-text-p">
                          <Send size={14} />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* SAFE AREA */}
        <div className="h-8" />
      </div>
    </div>
  );
}

// Small helper: extracts and shows a single frame from a video URL
function VideoThumb({ src }: { src: string }) {
  const [frame, setFrame] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    extractVideoFrame(src, 0.5).then((f) => {
      if (!cancelled && f) setFrame(f);
    });
    return () => { cancelled = true; };
  }, [src]);

  if (!frame) {
    return <FileText size={18} className="text-text-m" />;
  }

  return (
    <img src={frame} alt="" className="w-full h-full object-cover" />
  );
}

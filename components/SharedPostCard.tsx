"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";

type SharedPostData = {
  id: string;
  text: string | null;
  image_url: string | null;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

export function extractPostIdFromUrl(text: string): string | null {
  const match = text.match(/\/post\/([a-f0-9-]+)/i);
  return match ? match[1] : null;
}

export default function SharedPostCard({ postId }: { postId: string }) {
  const [post, setPost] = useState<SharedPostData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchPost = async () => {
      try {
        const { data } = await supabase
          .from("posts")
          .select(
            `
            id,
            text,
            image_url,
            profiles (
              username,
              display_name,
              avatar_url
            )
          `
          )
          .eq("id", postId)
          .single();

        if (!cancelled && data) {
          setPost({ ...data, profiles: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles } as SharedPostData);
        }
      } catch (error) {
        console.error("Failed to load shared post:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPost();
    return () => { cancelled = true; };
  }, [postId]);

  if (loading) {
    return (
      <div className="w-64 rounded-xl border border-zinc-800 bg-zinc-900 p-3 animate-pulse">
        <div className="h-3 bg-zinc-800 rounded w-1/2 mb-2" />
        <div className="h-2 bg-zinc-800 rounded w-3/4" />
      </div>
    );
  }

  if (!post) {
    return (
      <Link
        href={`/post/${postId}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors text-xs text-zinc-400"
      >
        <ExternalLink size={14} />
        View post
      </Link>
    );
  }

  const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;

  return (
    <Link
      href={`/post/${post.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block w-64 rounded-xl border border-zinc-800 bg-zinc-900 hover:bg-zinc-800/80 transition-colors overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <img
          src={profile?.avatar_url || "/default-avatar.png"}
          alt={profile?.display_name || "User"}
          className="w-5 h-5 rounded-full object-cover"
        />
        <span className="text-xs font-medium text-zinc-300 truncate">
          {profile?.display_name || "Drip User"}
        </span>
        <ExternalLink size={12} className="text-zinc-600 ml-auto shrink-0" />
      </div>

      {/* Text preview */}
      {post.text && (
        <p className="px-3 pb-2 text-xs text-zinc-400 line-clamp-2 leading-relaxed">
          {post.text}
        </p>
      )}

      {/* Image preview */}
      {post.image_url && (
        <div className="border-t border-zinc-800">
          <img
            src={post.image_url}
            alt="Shared post"
            className="w-full h-32 object-cover"
          />
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-2 border-t border-zinc-800/50">
        <span className="text-[10px] text-zinc-500 font-medium">
          dripskip.com
        </span>
      </div>
    </Link>
  );
}

"use client";

import { useEffect, useState } from "react";
import { MessageCircle } from 'lucide-react';
import CommentDrawer from '@/components/CommentDrawer';
import Link from "next/link";
import {
  MoreHorizontal,
  Flame,
  SkipForward,
  Share2,
  Check,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";

import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import { firebaseAuth } from "@/lib/firebase";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export type Post = {
  id: string;
  user_id: string;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  profiles: Profile | Profile[] | null;
  comment_count?: number;
};

type PostCardProps = {
  post: Post;
  currentProfileId?: string | null;
};

type VoteType = "drip" | "skip";

export default function PostCard({ post, currentProfileId: propCurrentProfileId }: PostCardProps) {
  const [imageError, setImageError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [dripCount, setDripCount] = useState(0);
  const [skipCount, setSkipCount] = useState(0);
  const [userVote, setUserVote] = useState<VoteType | null>(null);
  const [voting, setVoting] = useState(false);
  const [timeAgo, setTimeAgo] = useState<string>("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState<number>(post.comment_count || 0);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(propCurrentProfileId || null);

  // ==========================================
  // PROFILE & TIME
  // ==========================================

  const profile = Array.isArray(post.profiles)
    ? post.profiles[0]
    : post.profiles;

  const displayName =
    profile?.display_name || profile?.username || "Drip User";

  const username = profile?.username || "user";

  const avatar =
    !avatarError && profile?.avatar_url
      ? profile.avatar_url
      : "/default-avatar.png";

  // Defer timeAgo to client side to prevent Next.js hydration mismatches
  useEffect(() => {
    setTimeAgo(getTimeAgo(post.created_at));
  }, [post.created_at]);

  // ==========================================
  // LOAD VOTES & PROFILE ID
  // ==========================================

  useEffect(() => {
    setImageError(false);
    setAvatarError(false);

    let isMounted = true;

    const loadVotes = async (firebaseUser = firebaseAuth.currentUser) => {
      try {
        const { data, error } = await supabase
          .from("votes")
          .select("user_id, vote")
          .eq("fit_id", post.id);

        if (error) {
          console.error("❌ VOTE LOAD ERROR:", error);
          return;
        }

        if (!isMounted) return;

        let drip = 0;
        let skip = 0;
        let resolvedProfileId: string | null = propCurrentProfileId || null;

        if (firebaseUser) {
          try {
            const userProfile = await syncProfile(firebaseUser);
            resolvedProfileId = userProfile?.id || null;
            if (isMounted) setCurrentProfileId(resolvedProfileId);
          } catch (error) {
            console.error("PROFILE SYNC ERROR:", error);
          }
        }

        data?.forEach((vote) => {
          if (vote.vote === "drip") drip++;
          if (vote.vote === "skip") skip++;

          if (
            resolvedProfileId &&
            vote.user_id === resolvedProfileId
          ) {
            setUserVote(vote.vote as VoteType);
          }
        });

        setDripCount(drip);
        setSkipCount(skip);
      } catch (error) {
        console.error("❌ UNEXPECTED VOTE LOAD ERROR:", error);
      }
    };

    // Listen to Firebase Auth state initialization
    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      loadVotes(user);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [post.id, propCurrentProfileId]);

  // ==========================================
  // VOTE HANDLER
  // ==========================================

  const handleVote = async (voteType: VoteType) => {
    if (voting || userVote) return;

    const firebaseUser = firebaseAuth.currentUser;

    if (!firebaseUser) {
      alert("Please log in to vote.");
      return;
    }

    setVoting(true);

    try {
      const userProfile = await syncProfile(firebaseUser);

      if (!userProfile?.id) {
        throw new Error("Could not find your profile.");
      }

      // Optimistic update
      setUserVote(voteType);
      if (voteType === "drip") setDripCount((prev) => prev + 1);
      if (voteType === "skip") setSkipCount((prev) => prev + 1);

      const { error } = await supabase.from("votes").insert({
        user_id: userProfile.id,
        fit_id: post.id,
        vote: voteType,
      });

      if (error) {
        // Handle duplicate vote
        if (error.code === "23505") {
          console.log("⚠️ USER ALREADY VOTED");
          return;
        }

        // Revert Optimistic state if error occurs
        setUserVote(null);
        if (voteType === "drip") setDripCount((prev) => Math.max(0, prev - 1));
        if (voteType === "skip") setSkipCount((prev) => Math.max(0, prev - 1));

        throw error;
      }
    } catch (error) {
      console.error("❌ VOTE FAILED:", error);
      alert("Could not save your vote. Please try again.");
    } finally {
      setVoting(false);
    }
  };

  // ==========================================
  // SHARE HANDLER
  // ==========================================

  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post.id}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "Drip or Skip",
          text: post.text || "Check out this post on Drip or Skip.",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        alert("Post link copied!");
      }
    } catch {
      // User cancelled share
    }
  };

  return (
    <article className="rounded-2xl border border-zinc-900 bg-zinc-950 overflow-hidden">
      {/* ====================================== */}
      {/* HEADER */}
      {/* ====================================== */}
      <div className="flex items-center gap-3 p-4">
        <Link href={`/profile/${username}`}>
          <img
            src={avatar}
            alt={displayName}
            className="w-10 h-10 rounded-full object-cover border border-zinc-800 shrink-0"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <Link
            href={`/profile/${username}`}
            className="block group"
          >
            <p className="font-semibold text-sm truncate group-hover:underline">
              {displayName}
            </p>

            <p className="text-xs text-zinc-500 truncate">
              @{username} · {timeAgo}
            </p>
          </Link>
        </div>

        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded-full text-zinc-500 hover:text-white hover:bg-zinc-900 transition-colors"
          aria-label="More options"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* ====================================== */}
      {/* TEXT */}
      {/* ====================================== */}
      {post.text && (
        <div className="px-4 pb-4">
          <p className="text-sm sm:text-[15px] leading-6 text-zinc-100 whitespace-pre-wrap break-words">
            {post.text}
          </p>
        </div>
      )}

      {/* ====================================== */}
      {/* IMAGE */}
      {/* ====================================== */}
      {post.image_url && !imageError && (
        <div className="bg-black">
          <img
            src={post.image_url}
            alt="Post content"
            onError={() => setImageError(true)}
            className="w-full max-h-[600px] object-cover"
          />
        </div>
      )}

      {/* ====================================== */}
      {/* VIDEO */}
      {/* ====================================== */}
      {post.video_url && (
        <div className="bg-black">
          <video
            src={post.video_url}
            controls
            playsInline
            preload="metadata"
            className="w-full max-h-[600px] object-contain"
          />
        </div>
      )}

      {/* ====================================== */}
      {/* MAIN VOTING AREA */}
      {/* ====================================== */}
      <div className="px-3 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {/* DRIP BUTTON */}
          <button
            type="button"
            onClick={() => handleVote("drip")}
            disabled={voting || !!userVote}
            className={`
              relative flex items-center justify-center gap-2 min-h-14 rounded-2xl border transition-all active:scale-[0.97]
              ${
                userVote === "drip"
                  ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-300"
                  : userVote === "skip"
                  ? "border-zinc-900 bg-zinc-900/40 text-zinc-600"
                  : "border-cyan-400/30 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20 hover:border-cyan-400/60"
              }
              disabled:cursor-not-allowed
            `}
          >
            <Flame
              size={23}
              strokeWidth={2.5}
              className={userVote === "drip" ? "fill-cyan-400" : ""}
            />

            <div className="flex flex-col items-start">
              <span className="text-sm font-black uppercase tracking-wide">
                Drip
              </span>
              <span className="text-[11px] opacity-70">
                {dripCount} {dripCount === 1 ? "vote" : "votes"}
              </span>
            </div>

            {userVote === "drip" && (
              <Check size={18} className="absolute right-3" />
            )}
          </button>

          {/* SKIP BUTTON */}
          <button
            type="button"
            onClick={() => handleVote("skip")}
            disabled={voting || !!userVote}
            className={`
              relative flex items-center justify-center gap-2 min-h-14 rounded-2xl border transition-all active:scale-[0.97]
              ${
                userVote === "skip"
                  ? "border-rose-400/60 bg-rose-400/15 text-rose-300"
                  : userVote === "drip"
                  ? "border-zinc-900 bg-zinc-900/40 text-zinc-600"
                  : "border-rose-400/30 bg-rose-400/10 text-rose-300 hover:bg-rose-400/20 hover:border-rose-400/60"
              }
              disabled:cursor-not-allowed
            `}
          >
            <SkipForward
              size={23}
              strokeWidth={2.5}
              className={userVote === "skip" ? "fill-rose-400" : ""}
            />

            <div className="flex flex-col items-start">
              <span className="text-sm font-black uppercase tracking-wide">
                Skip
              </span>
              <span className="text-[11px] opacity-70">
                {skipCount} {skipCount === 1 ? "vote" : "votes"}
              </span>
            </div>

            {userVote === "skip" && (
              <Check size={18} className="absolute right-3" />
            )}
          </button>
        </div>
      </div>

      {/* ====================================== */}
      {/* SECONDARY ACTIONS */}
      {/* ====================================== */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-900/50 mt-3">
        <button
          type="button"
          onClick={() => setCommentsOpen(true)}
          className="flex items-center gap-2 px-3 py-1 rounded-xl text-zinc-400 hover:text-white hover:bg-zinc-900 active:scale-95 transition-all"
        >
          <MessageCircle size={17} />
          <span className="text-xs font-medium">
            {commentCount > 0 ? `${commentCount} ${commentCount === 1 ? 'Comment' : 'Comments'}` : 'Comment'}
          </span>
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-zinc-500 hover:text-white hover:bg-zinc-900 active:scale-95 transition-all"
          aria-label="Share"
        >
          <Share2 size={17} />
          <span className="text-xs font-medium">Share</span>
        </button>
      </div>

      <CommentDrawer
        postId={post.id}
        currentProfileId={currentProfileId}
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={() => setCommentCount((prev: number) => prev + 1)}
      />

    </article>
  );
}

/* ========================================== */
/* TIME HELPER (SAFE) */
/* ========================================== */

function getTimeAgo(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();

  if (isNaN(date.getTime())) {
    return "recently";
  }

  const seconds = Math.max(
    0,
    Math.floor((now.getTime() - date.getTime()) / 1000)
  );

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
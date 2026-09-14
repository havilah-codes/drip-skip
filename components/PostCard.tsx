"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  MessageCircle,
  MoreHorizontal,
  Flame,
  X,
  Share2,
  Check,
  Repeat2,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";

import CommentDrawer from "@/components/CommentDrawer";
import ShareSheet from "@/components/ShareSheet";
import VideoPlayer from "@/components/VideoPlayer";
import HashtagText from "@/components/HashtagText";
import RichText from "@/components/RichText";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import { firebaseAuth } from "@/lib/firebase";
import { sendNotification } from "@/lib/notifications";

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
  isRepost?: boolean;
};

type VoteType = "drip" | "skip";

export default function PostCard({
  post,
  currentProfileId: propCurrentProfileId,
  isRepost = false,
}: PostCardProps) {
  const [imageError, setImageError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [dripCount, setDripCount] = useState(0);
  const [skipCount, setSkipCount] = useState(0);
  const [userVote, setUserVote] = useState<VoteType | null>(null);
  const [voting, setVoting] = useState(false);
  const [timeAgo, setTimeAgo] = useState<string>("");
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [commentCount, setCommentCount] = useState<number>(
    post.comment_count || 0
  );
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(
    propCurrentProfileId || null
  );
  const [shareOpen, setShareOpen] = useState(false);
  const [repostCount, setRepostCount] = useState(0);
  const [userReposted, setUserReposted] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

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

  useEffect(() => {
    setTimeAgo(getTimeAgo(post.created_at));
  }, [post.created_at]);

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

          if (resolvedProfileId && vote.user_id === resolvedProfileId) {
            setUserVote(vote.vote as VoteType);
          }
        });

        setDripCount(drip);
        setSkipCount(skip);

        // Load repost count and user repost status
        const { data: repostsData } = await supabase
          .from("reposts")
          .select("user_id")
          .eq("post_id", post.id);

        if (repostsData) {
          setRepostCount(repostsData.length);
          if (resolvedProfileId) {
            setUserReposted(
              repostsData.some((r) => r.user_id === resolvedProfileId)
            );
          }
        }

        // Load saved status
        if (resolvedProfileId) {
          const { data: savedData } = await supabase
            .from("saved_posts")
            .select("id")
            .eq("user_id", resolvedProfileId)
            .eq("post_id", post.id)
            .maybeSingle();
          if (isMounted && savedData) {
            setIsSaved(true);
          }
        }
      } catch (error) {
        console.error("❌ UNEXPECTED VOTE LOAD ERROR:", error);
      }
    };

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      loadVotes(user);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [post.id, propCurrentProfileId]);

  const handleRepost = async () => {
    const firebaseUser = firebaseAuth.currentUser;
    if (!firebaseUser) {
      alert("Please log in to repost.");
      return;
    }

    const repostProfileId = currentProfileId;
    if (!repostProfileId) return;

    try {
      if (userReposted) {
        // Undo repost
        setUserReposted(false);
        setRepostCount((prev) => Math.max(0, prev - 1));
        const { error } = await supabase
          .from("reposts")
          .delete()
          .eq("post_id", post.id)
          .eq("user_id", repostProfileId);
        if (error) throw error;
      } else {
        // Repost
        setUserReposted(true);
        setRepostCount((prev) => prev + 1);
        const { error } = await supabase.from("reposts").insert({
          post_id: post.id,
          user_id: repostProfileId,
        });
        if (error) {
          if (error.code === "23505") {
            // Already reposted (unique constraint)
            return;
          }
          throw error;
        }
      }
    } catch (error) {
      console.error("❌ REPOST FAILED:", error);
      // Revert optimistic update
      setUserReposted(!userReposted);
      setRepostCount((prev) => (userReposted ? prev + 1 : Math.max(0, prev - 1)));
    }
  };

  const handleSave = async () => {
    const firebaseUser = firebaseAuth.currentUser;
    if (!firebaseUser) {
      alert("Please log in to save posts.");
      return;
    }

    const saveProfileId = currentProfileId;
    if (!saveProfileId) return;

    try {
      if (isSaved) {
        // Unsave
        setIsSaved(false);
        const { error } = await supabase
          .from("saved_posts")
          .delete()
          .eq("user_id", saveProfileId)
          .eq("post_id", post.id);
        if (error) throw error;
      } else {
        // Save
        setIsSaved(true);
        const { error } = await supabase.from("saved_posts").insert({
          user_id: saveProfileId,
          post_id: post.id,
        });
        if (error) {
          if (error.code === "23505") {
            // Already saved
            return;
          }
          throw error;
        }
      }
    } catch (error) {
      console.error("❌ SAVE FAILED:", error);
      setIsSaved(!isSaved);
    }
  };

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

      setUserVote(voteType);
      if (voteType === "drip") setDripCount((prev) => prev + 1);
      if (voteType === "skip") setSkipCount((prev) => prev + 1);

      const { error } = await supabase.from("votes").insert({
        user_id: userProfile.id,
        fit_id: post.id,
        vote: voteType,
      });

      if (error) {
        if (error.code === "23505") {
          console.log("⚠️ USER ALREADY VOTED");
          return;
        }

        setUserVote(null);
        if (voteType === "drip") setDripCount((prev) => Math.max(0, prev - 1));
        if (voteType === "skip") setSkipCount((prev) => Math.max(0, prev - 1));

        throw error;
      }

      // Notify post owner (fire-and-forget)
      if (post.user_id !== userProfile.id) {
        sendNotification({
          recipientId: post.user_id,
          type: voteType,
          postId: post.id,
        });
      }
    } catch (error) {
      console.error("❌ VOTE FAILED:", error);
      alert("Could not save your vote. Please try again.");
    } finally {
      setVoting(false);
    }
  };  return (
    <article className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden">
      {isRepost && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border-s/50">
          <Repeat2 size={14} className="text-green-500" />
          <span className="text-xs font-medium text-green-500">Reposted</span>
        </div>
      )}

      {/* HEADER — avatar, name + @username, timestamp + menu */}
      <div className="flex items-center gap-3 px-4 pt-3.5 pb-3">
        <Link href={`/profile/${username}`}>
          <img
            src={avatar}
            alt={displayName}
            onError={() => setAvatarError(true)}
            className="w-10 h-10 rounded-full object-cover border border-border-d shrink-0"
          />
        </Link>

        <div className="min-w-0 flex-1">
          <Link href={`/profile/${username}`} className="block group">
            <p className="font-semibold text-sm truncate group-hover:underline font-display">
              {displayName}
            </p>
            <p className="text-xs text-text-t truncate">@{username}</p>
          </Link>
        </div>

        <span className="text-xs text-text-t shrink-0">{timeAgo}</span>

        <button
          type="button"
          className="w-8 h-8 flex items-center justify-center rounded-full text-text-t hover:text-text-p hover:bg-bg-sunken transition-colors"
          aria-label="More options"
        >
          <MoreHorizontal size={18} />
        </button>
      </div>

      {/* MEDIA — framed photo/video with rounded corners */}
      {post.image_url && !imageError && (
        <div className="px-3">
          <div className="rounded-xl overflow-hidden bg-bg">
            <img
              src={post.image_url}
              alt="Post content"
              onError={() => setImageError(true)}
              className="w-full max-h-[600px] object-cover"
            />
          </div>
        </div>
      )}

      {post.video_url && (
        <div className="px-3">
          <div className="rounded-xl overflow-hidden bg-bg">
            <VideoPlayer
              src={post.video_url}
              className="w-full max-h-[600px]"
            />
          </div>
        </div>
      )}

      {/* VOTE PILL — segmented green Drip / dark Skip bar */}
      <div className="px-3 pt-3">
        <div className="flex items-stretch rounded-full bg-bg-sunken p-1">
          <button
            type="button"
            onClick={() => handleVote("drip")}
            disabled={voting || !!userVote}
            className={`
              flex-1 flex items-center justify-between gap-2 pl-3.5 pr-4 min-h-11 rounded-full transition-all active:scale-[0.98] disabled:cursor-not-allowed
              ${
                userVote === "drip"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : userVote === "skip"
                  ? "bg-emerald-600/25 text-emerald-100/50"
                  : "bg-emerald-600 text-white hover:bg-emerald-500"
              }
            `}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <Flame
                size={17}
                strokeWidth={2.5}
                className={userVote === "skip" ? "" : "fill-white"}
              />
              <span className="text-sm font-bold">Drip</span>
            </span>
            <span className="flex items-center gap-1">
              {userVote === "drip" && <Check size={15} strokeWidth={3} />}
              <span
                className={`text-sm font-bold tabular-nums ${
                  userVote === "skip" ? "text-emerald-100/50" : "text-white"
                }`}
              >
                {dripCount}
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleVote("skip")}
            disabled={voting || !!userVote}
            className={`
              flex-1 flex items-center justify-between gap-2 pl-4 pr-3.5 min-h-11 rounded-full transition-all active:scale-[0.98] disabled:cursor-not-allowed
              ${
                userVote === "skip"
                  ? "bg-rose-500/15 text-rose-300 shadow-sm"
                  : userVote === "drip"
                  ? "text-text-m"
                  : "text-text-s hover:text-text-p hover:bg-white/5"
              }
            `}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <X size={17} strokeWidth={2.5} />
              <span className="text-sm font-semibold">Skip</span>
            </span>
            <span className="flex items-center gap-1">
              {userVote === "skip" && <Check size={15} strokeWidth={3} />}
              <span className="text-sm font-semibold tabular-nums">
                {skipCount}
              </span>
            </span>
          </button>
        </div>
      </div>

      {/* ACTION ROW — icons only */}
      <div className="flex items-center justify-between px-4 pb-2.5 pt-2.5">
        <div className="flex items-center gap-6">
          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="flex items-center gap-1.5 py-1.5 text-text-t hover:text-text-p active:scale-90 transition-all"
            aria-label="Comments"
          >
            <MessageCircle size={19} />
            {commentCount > 0 && (
              <span className="text-xs font-medium">{commentCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={handleRepost}
            className={`flex items-center gap-1.5 py-1.5 active:scale-90 transition-all ${
              userReposted
                ? "text-green-400"
                : "text-text-t hover:text-text-p"
            }`}
            aria-label="Repost"
          >
            <Repeat2 size={19} className={userReposted ? "fill-green-400" : ""} />
            {repostCount > 0 && (
              <span className="text-xs font-medium">{repostCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="flex items-center py-1.5 text-text-t hover:text-text-p active:scale-90 transition-all"
            aria-label="Share"
          >
            <Share2 size={18} />
          </button>
        </div>

        <button
          type="button"
          onClick={handleSave}
          className={`flex items-center gap-1.5 py-1.5 active:scale-90 transition-all ${
            isSaved ? "text-amber-400" : "text-text-t hover:text-text-p"
          }`}
          aria-label={isSaved ? "Unsave" : "Save"}
        >
          {isSaved ? (
            <BookmarkCheck size={19} className="fill-amber-400" />
          ) : (
            <Bookmark size={19} />
          )}
        </button>
      </div>

      {/* CAPTION — sits under the actions, like the mock */}
      {post.text && (
        <div className="px-4 pb-4 pt-1.5">
          <p className="text-sm leading-6 text-text-p whitespace-pre-wrap break-words">
            <RichText text={post.text} />
          </p>
        </div>
      )}

      <CommentDrawer
        postId={post.id}
        postOwnerId={post.user_id}
        currentProfileId={currentProfileId}
        isOpen={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={() => setCommentCount((prev: number) => prev + 1)}
      />

      <ShareSheet
        postId={post.id}
        postText={post.text}
        currentProfileId={currentProfileId}
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
      />
    </article>
  );
}

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
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, UserCheck, UserPlus } from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { getOrCreateChat } from "@/lib/chat";

import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import PostCard, { type Post } from "@/components/PostCard";
import { ProfileSkeleton } from "@/components/skeletons/SkeletonPulse";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at?: string;
};

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();

  const rawUsername = params.username as string;
  const username = rawUsername?.toLowerCase();

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [reposts, setReposts] = useState<Post[]>([]);

  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [messageLoading, setMessageLoading] = useState(false);


  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [avatarError, setAvatarError] = useState(false);

  // 1. Listen for current auth user
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const synced = await syncProfile(user);
          if (synced) {
            setCurrentProfileId(synced.id);
          }
        } catch (e) {
          console.error("❌ Failed syncing viewer profile:", e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Fetch public profile, posts, stats, and follow status
  useEffect(() => {
    if (!username) return;

    let isCancelled = false;

    const loadProfile = async () => {
      setLoading(true);
      setNotFound(false);

      try {
        console.log("👤 LOADING PROFILE:", username);

        // Fetch Profile
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select(`id, username, display_name, avatar_url, created_at`)
          .eq("username", username)
          .maybeSingle();

        if (profileError) {
          console.error("❌ PROFILE LOAD ERROR:", profileError);
          throw profileError;
        }

        if (!profileData) {
          if (!isCancelled) setNotFound(true);
          return;
        }

        if (isCancelled) return;
        setProfile(profileData);

        const profileId = profileData.id;

        // Run remaining queries concurrently
        const [
          postsRes,
          repostsRes,
          followersRes,
          followingRes,
          checkFollowRes,
        ] = await Promise.all([
          // POSTS
          supabase
            .from("posts")
            .select(`
              id,
              user_id,
              text,
              image_url,
              video_url,
              created_at,
              profiles (
                id,
                username,
                display_name,
                avatar_url
              )
            `)
            .eq("user_id", profileId)
            .order("created_at", {
              ascending: false,
            }),

          // REPOSTS
          supabase
            .from("reposts")
            .select("post_id")
            .eq("user_id", profileId)
            .order("created_at", { ascending: false }),

          // FOLLOWERS
          supabase
            .from("follows")
            .select("follower_id", {
              count: "exact",
              head: true,
            })
            .eq("following_id", profileId),

          // FOLLOWING
          supabase
            .from("follows")
            .select("following_id", {
              count: "exact",
              head: true,
            })
            .eq("follower_id", profileId),

          // FOLLOW STATUS
          currentProfileId &&
          currentProfileId !== profileId
            ? supabase
                .from("follows")
                .select("follower_id")
                .eq(
                  "follower_id",
                  currentProfileId
                )
                .eq(
                  "following_id",
                  profileId
                )
                .maybeSingle()
            : Promise.resolve({
                data: null,
                error: null,
              }),
        ]);

        if (isCancelled) return;

        if (postsRes.error) {
          console.error("❌ POSTS LOAD ERROR:", postsRes.error);
        } else {
          setPosts((postsRes.data as Post[]) || []);
        }

        // Fetch reposted posts
        if (repostsRes.data && repostsRes.data.length > 0) {
          const repostedPostIds = repostsRes.data.map((r) => r.post_id);
          const { data: repostedPosts } = await supabase
            .from("posts")
            .select(`
              id,
              user_id,
              text,
              image_url,
              video_url,
              created_at,
              profiles (
                id,
                username,
                display_name,
                avatar_url
              )
            `)
            .in("id", repostedPostIds)
            .order("created_at", { ascending: false });

          if (!isCancelled && repostedPosts) {
            setReposts(repostedPosts as Post[]);
          }
        }

        setFollowersCount(followersRes.count || 0);
        setFollowingCount(followingRes.count || 0);
        setIsFollowing(!!checkFollowRes.data);

      } catch (error) {
        console.error("❌ PROFILE PAGE ERROR:", error);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadProfile();

    return () => {
      isCancelled = true;
    };
  }, [username, currentProfileId]);

  // Handle Follow / Unfollow actions
  const handleFollowToggle = async () => {
    if (
      !currentUser ||
      !currentProfileId ||
      !profile ||
      followLoading
    ) {
      return;
    }

    // Never allow following yourself
    if (currentProfileId === profile.id) {
      return;
    }

    setFollowLoading(true);

    try {
      console.log(
        isFollowing
          ? "👋 UNFOLLOWING:"
          : "➕ FOLLOWING:",
        profile.username
      );

      if (isFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", currentProfileId)
          .eq("following_id", profile.id);

        if (error) {
          console.error(
            "❌ UNFOLLOW ERROR:",
            error
          );

          throw error;
        }

        setIsFollowing(false);

        setFollowersCount((prev) =>
          Math.max(0, prev - 1)
        );

        console.log("✅ UNFOLLOW SUCCESS");
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({
            follower_id: currentProfileId,
            following_id: profile.id,
          });

        if (error) {
          console.error(
            "❌ FOLLOW ERROR:",
            error
          );

          throw error;
        }

        setIsFollowing(true);

        setFollowersCount(
          (prev) => prev + 1
        );

        console.log("✅ FOLLOW SUCCESS");
      }
    } catch (error) {
      console.error(
        "❌ FOLLOW TOGGLE FAILED:",
        error
      );

      alert(
        "Something went wrong. Please try again."
      );
    } finally {
      setFollowLoading(false);
    }
  };

  const handleMessage = async () => {
  if (
    !currentProfileId ||
    !profile ||
    messageLoading
  ) {
    return;
  }

  setMessageLoading(true);

  try {
    const chatId = await getOrCreateChat(
      currentProfileId,
      profile.id
    );

    router.push(`/messages/${chatId}`);
  } catch (error) {
    console.error(
      "❌ START CHAT ERROR:",
      error
    );

    alert("Could not start chat.");
    } finally {
      setMessageLoading(false);
    }
  };

  // ==========================================
  // LOADING STATE
  // ==========================================
  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-20">
        <ProfileSkeleton />
      </main>
    );
  }

  // ==========================================
  // NOT FOUND STATE
  // ==========================================
  if (notFound || !profile) {
    return (
      <main className="min-h-screen bg-bg text-text-p">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm text-text-s hover:text-text-p transition-colors"
          >
            <ArrowLeft size={18} />
            Back
          </button>

          <div className="flex flex-col items-center justify-center py-32 text-center">
            <div className="w-16 h-16 rounded-full bg-bg-sunken flex items-center justify-center mb-5 border border-border-d">
              <span className="text-2xl text-text-t">?</span>
            </div>

            <h1 className="text-xl font-bold font-display">Profile not found</h1>
            <p className="text-sm text-text-t mt-2">@{username} doesn't exist.</p>

            <Link
              href="/feed"
              className="mt-6 px-5 py-2.5 rounded-xl bg-btn text-btn-text text-sm font-bold active:scale-95 transition-all"
            >
              Back to feed
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const isSelf = currentProfileId === profile.id;
  const avatarSrc = !avatarError && profile.avatar_url ? profile.avatar_url : "/default-avatar.png";

  // ==========================================
  // MAIN PROFILE VIEW
  // ==========================================
  return (
    <main className="min-h-screen bg-bg text-text-p">
      {/* TOP HEADER */}
      <header className="sticky top-0 z-40 border-b border-border-s bg-bg/85 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-all"
            aria-label="Go back"
          >
            <ArrowLeft size={19} />
          </button>

          <div className="ml-3 min-w-0">
            <p className="font-semibold truncate">{profile.display_name}</p>
            <p className="text-xs text-text-t">@{profile.username}</p>
          </div>
        </div>
      </header>

      {/* CONTENT WRAPPER */}
      <div className="max-w-2xl mx-auto px-4 py-6 pb-28">

        {/* PROFILE HEADER CARD */}
        <section className="rounded-3xl border border-border-s bg-bg-raised overflow-hidden">
          {/* COVER GRAPHIC */}
          <div className="h-28 sm:h-36 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black" />

          {/* PROFILE INFO & ACTIONS */}
          <div className="px-5 pb-5">
            <div className="-mt-12 flex items-end justify-between">
              <img
                src={avatarSrc}
                alt={profile.display_name}
                onError={() => setAvatarError(true)}
                className="w-24 h-24 rounded-full object-cover border-4 border-black bg-bg-sunken"
              />

              {/* ACTION BUTTON */}
              {isSelf ? (
                <Link
                  href="/profile/edit"
                  className="px-5 py-2.5 rounded-xl border border-border-d text-text-p text-sm font-bold hover:bg-bg-sunken transition-colors"
                >
                  Edit Profile
                </Link>
              ) : (
                <div className="flex items-center gap-2">
                    {/* MESSAGE */}
                    <button
                      type="button"
                      onClick={handleMessage}
                      disabled={messageLoading || !currentUser}
                      className="px-5 py-2.5 rounded-xl border border-border-d text-text-p text-sm font-bold hover:bg-bg-sunken active:scale-95 transition-all disabled:opacity-50"
                    >
                      {messageLoading ? "Opening..." : "Message"}
                    </button>

                    {/* FOLLOW */}
                    <button
                      type="button"
                      onClick={handleFollowToggle}
                      disabled={followLoading || !currentUser}
                      className={`px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 active:scale-95 transition-all disabled:opacity-50 ${
                        isFollowing
                          ? "border border-border-d text-text-s hover:text-rose-400 hover:border-rose-950 hover:bg-rose-950/20"
                          : "bg-btn text-btn-text hover:bg-btn/80"
                      }`}
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck size={16} />
                          Following
                        </>
                      ) : (
                        <>
                          <UserPlus size={16} />
                          Follow
                        </>
                      )}
                    </button>
                  </div>
              )}
            </div>
            <div className="mt-4">
              <h1 className="text-xl font-bold font-display">{profile.display_name}</h1>
              <p className="text-sm text-text-t">@{profile.username}</p>
            </div>

            {/* STATS */}
            <div className="flex items-center gap-6 mt-5">
              <div>
                <p className="font-bold">{posts.length}</p>
                <p className="text-xs text-text-t">Posts</p>
              </div>

              <div>
                <p className="font-bold">{followersCount}</p>
                <p className="text-xs text-text-t">Followers</p>
              </div>

              <div>
                <p className="font-bold">{followingCount}</p>
                <p className="text-xs text-text-t">Following</p>
              </div>
            </div>
          </div>
        </section>

        {/* POSTS LIST */}
        <section className="mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-lg font-display">Posts</h2>
            <span className="text-xs text-text-m">{posts.length + reposts.length}</span>
          </div>

          {posts.length === 0 && reposts.length === 0 ? (
            <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
              <div className="w-12 h-12 rounded-full bg-bg-sunken flex items-center justify-center mx-auto mb-4 text-text-t">
                ✦
              </div>
              <h3 className="font-semibold font-display">No posts yet</h3>
              <p className="text-sm text-text-t mt-2">
                @{profile.username} hasn't posted anything yet.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
              {reposts.map((post) => (
                <PostCard key={`repost-${post.id}`} post={post} isRepost />
              ))}
            </div>
          )}
        </section>

      </div>
    </main>
  );
}
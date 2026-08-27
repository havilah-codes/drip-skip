"use client";

import { useEffect, useState } from "react";
import { Search, Sparkles, Swords, TrendingUp, Trophy, Flame } from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import UserCard from "@/components/UserCard";
import BottomNav from "@/components/BottomNav";
import { ExploreSkeleton } from "@/components/skeletons/SkeletonPulse";
import Link from "next/link";
import { Hash } from "lucide-react";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export default function ExplorePage() {
  const [user, setUser] = useState<User | null>(null);
  const [currentProfileId, setCurrentProfileId] =
    useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [following, setFollowing] = useState<
    Set<string>
  >(new Set());

  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [followLoading, setFollowLoading] =
    useState<string | null>(null);

  const [trending, setTrending] = useState<
    { id: string; name: string; post_count: number }[]
  >([]);

  // ==========================================
  // AUTH
  // ==========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (currentUser) => {
        setUser(currentUser);

        if (!currentUser) {
          setLoading(false);
          return;
        }

        try {
          const profile =
            await syncProfile(currentUser);

          if (profile?.id) {
            setCurrentProfileId(profile.id);
          }
        } catch (error) {
          console.error(
            "❌ EXPLORE PROFILE SYNC ERROR:",
            error
          );
        }
      }
    );

    return () => unsubscribe();
  }, []);

  // ==========================================
  // LOAD FOLLOWING
  // ==========================================

  useEffect(() => {
    if (!currentProfileId) return;

    const loadFollowing = async () => {
      const { data, error } = await supabase
        .from("follows")
        .select("following_id")
        .eq(
          "follower_id",
          currentProfileId
        );

      if (error) {
        console.error(
          "❌ FOLLOWING LOAD ERROR:",
          error
        );
        return;
      }

      setFollowing(
        new Set(
          (data || []).map(
            (row) => row.following_id
          )
        )
      );
    };

    loadFollowing();
  }, [currentProfileId]);

  // ==========================================
  // SEARCH USERS
  // ==========================================

  useEffect(() => {
    if (!currentProfileId) return;

    const timer = setTimeout(() => {
      searchUsers(search);
    }, 300);

    return () => clearTimeout(timer);
  }, [search, currentProfileId]);

  const searchUsers = async (query: string) => {
    setSearching(true);

    try {
      const trimmed = query.trim();

      // ==========================================
      // SEARCH MODE
      // ==========================================

      if (trimmed) {
        const { data, error } = await supabase
          .from("profiles")
          .select(
            "id, username, display_name, avatar_url"
          )
          .neq("id", currentProfileId)
          .or(
            `username.ilike.%${trimmed}%,display_name.ilike.%${trimmed}%`
          )
          .limit(20);

        if (error) {
          console.error(
            "❌ USER SEARCH ERROR:",
            error
          );
          return;
        }

        setProfiles(data || []);
        return;
      }

      // ==========================================
      // DISCOVER MODE
      // ONLY SHOW 3 RANDOM USERS
      // ==========================================

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url"
        )
        .neq("id", currentProfileId)
        .limit(20);

      if (error) {
        console.error(
          "❌ DISCOVER USERS ERROR:",
          error
        );
        return;
      }

      // Shuffle the returned users
      const shuffled = [...(data || [])];

      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(
          Math.random() * (i + 1)
        );

        [shuffled[i], shuffled[j]] = [
          shuffled[j],
          shuffled[i],
        ];
      }

      // Only display 3
      setProfiles(shuffled.slice(0, 3));

    } finally {
      setSearching(false);
      setLoading(false);
    }
  };

  // ==========================================
  // FOLLOW / UNFOLLOW
  // ==========================================

  const toggleFollow = async (
    profile: Profile
  ) => {
    if (
      !currentProfileId ||
      currentProfileId === profile.id
    ) {
      return;
    }

    setFollowLoading(profile.id);

    const alreadyFollowing =
      following.has(profile.id);

    try {
      if (alreadyFollowing) {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq(
            "follower_id",
            currentProfileId
          )
          .eq(
            "following_id",
            profile.id
          );

        if (error) {
          throw error;
        }

        setFollowing((current) => {
          const next = new Set(current);
          next.delete(profile.id);
          return next;
        });
      } else {
        const { error } = await supabase
          .from("follows")
          .insert({
            follower_id: currentProfileId,
            following_id: profile.id,
          });

        if (error) {
          throw error;
        }

        setFollowing((current) => {
          const next = new Set(current);
          next.add(profile.id);
          return next;
        });

        // Notify followed user (fire-and-forget)
        try {
          const { socket, connectSocket } = await import("@/lib/socket");
          if (!socket.connected) await connectSocket();
          socket.emit("user_followed", {
            followed_user_id: profile.id,
          });
        } catch { /* ignore */ }
      }
    } catch (error) {
      console.error(
        "❌ EXPLORE FOLLOW ERROR:",
        error
      );
    } finally {
      setFollowLoading(null);
    }
  };

  // ==========================================
  // LOAD TRENDING HASHTAGS (fire-and-forget, after main page mounts)
  // ==========================================

  useEffect(() => {
    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const { data: hashtagData } = await supabase
          .from("hashtags")
          .select("id")
          .limit(1);

        if (cancelled || !hashtagData) return;

        const { data, error } = await supabase
          .from("post_hashtags")
          .select("hashtag_id, hashtags (id, name)")
          .order("created_at", { ascending: false })
          .limit(50);

        if (cancelled) return;
        if (error || !data || data.length === 0) return;

        const counts = new Map<string, { id: string; name: string; count: number }>();

        for (const row of data) {
          const h = Array.isArray(row.hashtags) ? row.hashtags[0] : row.hashtags;
          if (!h) continue;
          const existing = counts.get(h.name);
          if (existing) {
            existing.count++;
          } else {
            counts.set(h.name, { id: h.id, name: h.name, count: 1 });
          }
        }

        const sorted = Array.from(counts.values())
          .sort((a, b) => b.count - a.count)
          .slice(0, 10)
          .map((t) => ({ id: t.id, name: t.name, post_count: t.count }));

        if (!cancelled && sorted.length > 0) {
          setTrending(sorted);
        }
      } catch {
        // Hashtags table doesn't exist yet — that's fine
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-28">
        <ExploreSkeleton />
        <BottomNav />
      </main>
    );
  }

  // ==========================================
  // PAGE
  // ==========================================

  return (
    <main className="min-h-screen bg-bg text-text-p pb-28">
      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* HEADER */}

        <div className="mb-6">
          <div className="flex items-center gap-2">
            <Sparkles
              size={22}
              className="text-text-p"
            />

            <h1 className="text-2xl font-bold font-display">
              Explore
            </h1>
          </div>

          <p className="text-sm text-text-t mt-1">
            Discover people and find your council.
          </p>
        </div>

        {/* COMPETITIVE SECTIONS */}

        {!search.trim() && (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <Link
              href="/battles"
              className="flex items-center gap-3 p-4 rounded-2xl border border-amber-900/30 bg-gradient-to-br from-amber-950/30 to-rose-950/20 hover:from-amber-950/50 hover:to-rose-950/30 transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-950/60 flex items-center justify-center">
                <Swords size={20} className="text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold font-display">Fit Battles</p>
                <p className="text-[10px] text-text-t">Head-to-head</p>
              </div>
            </Link>

            <Link
              href="/trending"
              className="flex items-center gap-3 p-4 rounded-2xl border border-cyan-900/30 bg-gradient-to-br from-cyan-950/30 to-emerald-950/20 hover:from-cyan-950/50 hover:to-emerald-950/30 transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-cyan-950/60 flex items-center justify-center">
                <TrendingUp size={20} className="text-cyan-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold font-display">Trending</p>
                <p className="text-[10px] text-text-t">Hot fits</p>
              </div>
            </Link>

            <Link
              href="/challenges"
              className="flex items-center gap-3 p-4 rounded-2xl border border-purple-900/30 bg-gradient-to-br from-purple-950/30 to-indigo-950/20 hover:from-purple-950/50 hover:to-indigo-950/30 transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-950/60 flex items-center justify-center">
                <Flame size={20} className="text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold font-display">Challenges</p>
                <p className="text-[10px] text-text-t">Themed contests</p>
              </div>
            </Link>

            <Link
              href="/leaderboard"
              className="flex items-center gap-3 p-4 rounded-2xl border border-amber-900/30 bg-gradient-to-br from-amber-950/30 to-yellow-950/20 hover:from-amber-950/50 hover:to-yellow-950/30 transition-all active:scale-[0.98]"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-950/60 flex items-center justify-center">
                <Trophy size={20} className="text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold font-display">Leaderboard</p>
                <p className="text-[10px] text-text-t">Weekly ranks</p>
              </div>
            </Link>
          </div>
        )}

        {/* SEARCH */}

        <div className="relative mb-6">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-t"
          />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Search people..."
            className="
              w-full
              h-12
              rounded-2xl
              border
              border-border-d
              bg-bg-raised
              pl-11
              pr-4
              text-sm
              text-text-p
              outline-none
              placeholder:text-text-m
              focus:border-zinc-600
              transition-colors
            "
          />
        </div>

        {/* TRENDING HASHTAGS (when no search) */}
        {!search.trim() && trending.length > 0 && (
          <div className="mb-6">
            <h2 className="font-semibold mb-3 font-display">
              Trending Now
            </h2>
            <div className="flex flex-wrap gap-2">
              {trending.map((tag) => (
                <Link
                  key={tag.id}
                  href={`/hashtag/${tag.name}`}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-d bg-bg-raised hover:bg-bg-sunken hover:border-zinc-700 transition-colors"
                >
                  <Hash size={14} className="text-cyan-400" />
                  <span className="text-sm font-medium">
                    {tag.name}
                  </span>
                  <span className="text-[10px] text-text-m">
                    {tag.post_count}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* RESULTS HEADER */}

        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">
            {search.trim()
              ? "Search results"
              : "Discover people"}
          </h2>

          {searching && (
            <span className="text-xs text-text-m">
              Searching...
            </span>
          )}
        </div>

        {/* RESULTS */}

        {profiles.length === 0 ? (
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <Search
              size={28}
              className="mx-auto text-text-m mb-4"
            />

            <h3 className="font-semibold font-display">
              No users found
            </h3>

            <p className="text-sm text-text-t mt-2">
              Try searching for another username
              or name.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {profiles.map((profile) => (
              <UserCard
                key={profile.id}
                profile={profile}
                isFollowing={following.has(
                  profile.id
                )}
                isCurrentUser={
                  profile.id === currentProfileId
                }
                loading={
                  followLoading === profile.id
                }
                onFollow={() =>
                  toggleFollow(profile)
                }
              />
            ))}
          </div>
        )}
      </div>
      <BottomNav/>
    </main>
  );
}
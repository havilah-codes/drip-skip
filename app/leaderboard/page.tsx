"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Crown,
  Medal,
  Award,
  Flame,
  TrendingUp,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Target,
  ArrowLeft,
} from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import BottomNav from "@/components/BottomNav";

type LeaderboardEntry = {
  rank: number;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  drip_count: number;
  skip_count: number;
  post_count: number;
  drip_ratio: number;
  isCurrentUser: boolean;
};

// ==========================================
// MOCK DATA
// ==========================================

const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { rank: 1, user_id: "u1", username: "fitking", display_name: "Marcus Reed", avatar_url: null, drip_count: 142, skip_count: 23, post_count: 18, drip_ratio: 0.86, isCurrentUser: false },
  { rank: 2, user_id: "u2", username: "stylequeen", display_name: "Aria Chen", avatar_url: null, drip_count: 128, skip_count: 31, post_count: 15, drip_ratio: 0.81, isCurrentUser: false },
  { rank: 3, user_id: "u3", username: "denimhead", display_name: "Jake Wilson", avatar_url: null, drip_count: 97, skip_count: 19, post_count: 12, drip_ratio: 0.84, isCurrentUser: false },
  { rank: 4, user_id: "u4", username: "neonvibes", display_name: "Sofia Reyes", avatar_url: null, drip_count: 85, skip_count: 28, post_count: 11, drip_ratio: 0.75, isCurrentUser: false },
  { rank: 5, user_id: "u5", username: "streetlord", display_name: "Kai Thompson", avatar_url: null, drip_count: 73, skip_count: 15, post_count: 9, drip_ratio: 0.83, isCurrentUser: false },
  { rank: 6, user_id: "u6", username: "thriftpriincess", display_name: "Zoe Martinez", avatar_url: null, drip_count: 61, skip_count: 22, post_count: 8, drip_ratio: 0.73, isCurrentUser: false },
  { rank: 7, user_id: "u7", username: "minimaliste", display_name: "Liam Park", avatar_url: null, drip_count: 54, skip_count: 12, post_count: 7, drip_ratio: 0.82, isCurrentUser: false },
  { rank: 8, user_id: "u8", username: "layercake", display_name: "Nina Okafor", avatar_url: null, drip_count: 48, skip_count: 18, post_count: 6, drip_ratio: 0.73, isCurrentUser: false },
];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [currentWeekStart, setCurrentWeekStart] = useState(getWeekStart(new Date()));
  const [useMock, setUseMock] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }
      setUser(currentUser);
      await syncProfile(currentUser);
    });
    return () => unsubscribe();
  }, [router]);

  const loadLeaderboard = useCallback(async () => {
    if (!user) return;

    const weekEnd = new Date(currentWeekStart.getTime() + 7 * 24 * 3600_000);

    try {
      // First, try the weekly_leaderboards table
      const { data: lbData, error: lbError } = await supabase
        .from("weekly_leaderboards")
        .select("*")
        .eq("week_start", currentWeekStart.toISOString().split("T")[0])
        .order("rank", { ascending: true })
        .limit(50);

      if (!lbError && lbData && lbData.length > 0) {
        // Fetch profiles for these users
        const userIds = lbData.map((e) => e.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", userIds);

        const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);
        const currentProfile = await syncProfile(user);

        const enriched: LeaderboardEntry[] = lbData.map((e) => {
          const p = profileMap.get(e.user_id);
          return {
            rank: e.rank,
            user_id: e.user_id,
            username: p?.username || "user",
            display_name: p?.display_name || "User",
            avatar_url: p?.avatar_url || null,
            drip_count: e.drip_count,
            skip_count: e.skip_count,
            post_count: e.post_count,
            drip_ratio: e.drip_ratio,
            isCurrentUser: e.user_id === currentProfile?.id,
          };
        });

        setEntries(enriched);
        setLoading(false);
        return;
      }

      // Fallback: compute from raw data
      const { data: posts } = await supabase
        .from("posts")
        .select("id, user_id")
        .gte("created_at", currentWeekStart.toISOString())
        .lt("created_at", weekEnd.toISOString());

      if (!posts || posts.length === 0) {
        setUseMock(true);
        setEntries(MOCK_LEADERBOARD);
        setLoading(false);
        return;
      }

      const postIds = posts.map((p) => p.id);
      const postsByUser = new Map<string, string[]>();
      posts.forEach((p) => {
        const arr = postsByUser.get(p.user_id) || [];
        arr.push(p.id);
        postsByUser.set(p.user_id, arr);
      });

      const { data: votes } = await supabase
        .from("votes")
        .select("fit_id, vote")
        .in("fit_id", postIds);

      const userStats = new Map<string, { drip: number; skip: number }>();
      votes?.forEach((v) => {
        const ownerId = posts.find((p) => p.id === v.fit_id)?.user_id;
        if (!ownerId) return;
        const stats = userStats.get(ownerId) || { drip: 0, skip: 0 };
        if (v.vote === "drip") stats.drip++;
        if (v.vote === "skip") stats.skip++;
        userStats.set(ownerId, stats);
      });

      // Fetch all user profiles
      const allUserIds = Array.from(postsByUser.keys());
      const { data: allProfiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", allUserIds);

      const currentProfile = await syncProfile(user);
      const profileMap = new Map(allProfiles?.map((p) => [p.id, p]) || []);

      // Build leaderboard
      const rows: LeaderboardEntry[] = allUserIds.map((uid) => {
        const stats = userStats.get(uid) || { drip: 0, skip: 0 };
        const total = stats.drip + stats.skip;
        const p = profileMap.get(uid);
        return {
          rank: 0,
          user_id: uid,
          username: p?.username || "user",
          display_name: p?.display_name || "User",
          avatar_url: p?.avatar_url || null,
          drip_count: stats.drip,
          skip_count: stats.skip,
          post_count: postsByUser.get(uid)?.length || 0,
          drip_ratio: total > 0 ? stats.drip / total : 0,
          isCurrentUser: uid === currentProfile?.id,
        };
      });

      rows.sort((a, b) => b.drip_count - a.drip_count || b.drip_ratio - a.drip_ratio);
      rows.forEach((r, i) => (r.rank = i + 1));

      if (rows.length === 0) {
        setUseMock(true);
        setEntries(MOCK_LEADERBOARD);
      } else {
        setEntries(rows);
      }
    } catch {
      setUseMock(true);
      setEntries(MOCK_LEADERBOARD);
    } finally {
      setLoading(false);
    }
  }, [user, currentWeekStart]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      loadLeaderboard();
    }
  }, [user, loadLeaderboard]);

  const goToPrevWeek = () => {
    setCurrentWeekStart((prev) => new Date(prev.getTime() - 7 * 24 * 3600_000));
  };

  const goToNextWeek = () => {
    const next = new Date(currentWeekStart.getTime() + 7 * 24 * 3600_000);
    if (next <= getWeekStart(new Date())) {
      setCurrentWeekStart(next);
    }
  };

  const weekEnd = new Date(currentWeekStart.getTime() + 6 * 24 * 3600_000);
  const isCurrentWeek = currentWeekStart.getTime() === getWeekStart(new Date()).getTime();

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown size={20} className="text-amber-400" />;
    if (rank === 2) return <Medal size={20} className="text-zinc-300" />;
    if (rank === 3) return <Award size={20} className="text-amber-600" />;
    return (
      <div className="w-6 h-6 rounded-full bg-bg-sunken flex items-center justify-center">
        <span className="text-xs font-bold text-text-m">{rank}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-28">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            <Link href="/explore" className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors">
              <ArrowLeft size={19} />
            </Link>
            <Trophy size={20} className="text-amber-400" />
            <h1 className="text-lg font-bold font-display">Leaderboard</h1>
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-text-t" />
        </div>
        <BottomNav />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg text-text-p pb-28">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/explore" className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors">
            <ArrowLeft size={19} />
          </Link>
          <Trophy size={20} className="text-amber-400" />
          <h1 className="text-lg font-bold font-display">Leaderboard</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* WEEK SELECTOR */}
        <div className="flex items-center justify-between mb-6 bg-bg-raised border border-border-s rounded-2xl p-4">
          <button
            type="button"
            onClick={goToPrevWeek}
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <div className="text-center">
            <div className="flex items-center gap-2 justify-center">
              <Calendar size={14} className="text-amber-400" />
              <span className="text-sm font-semibold font-display">
                {formatDate(currentWeekStart)} — {formatDate(weekEnd)}
              </span>
            </div>
            {isCurrentWeek && (
              <span className="text-[10px] text-emerald-400 font-medium">CURRENT WEEK</span>
            )}
          </div>
          <button
            type="button"
            onClick={goToNextWeek}
            disabled={isCurrentWeek}
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors disabled:opacity-30"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* TOP 3 PODIUM */}
        {entries.length >= 3 && (
          <div className="flex items-end justify-center gap-3 mb-8 px-4">
            {/* #2 — Silver */}
            <div className="w-[115px] text-center">
              <img
                src={entries[1].avatar_url || "/default-avatar.png"}
                alt=""
                className="w-16 h-16 rounded-full object-cover mx-auto border-[3px] border-zinc-200 mb-2"
              />
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{entries[1].display_name}</p>
              <p className="text-[10px] text-gray-900 dark:text-white mb-2">@{entries[1].username}</p>
              <div className="rounded-t-xl bg-gradient-to-b from-zinc-300 to-zinc-400 pt-3 pb-2 px-2">
                <Medal size={18} className="mx-auto text-white mb-1" />
                <p className="text-lg font-black text-white">#2</p>
                <p className="text-[11px] text-white font-bold flex items-center gap-1"><Flame size={10} /> {entries[1].drip_count}</p>
              </div>
            </div>

            {/* #1 — Gold */}
            <div className="w-[130px] text-center">
              <img
                src={entries[0].avatar_url || "/default-avatar.png"}
                alt=""
                className="w-20 h-20 rounded-full object-cover mx-auto border-[4px] border-yellow-300 mb-2 shadow-lg shadow-yellow-400/30"
              />
              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{entries[0].display_name}</p>
              <p className="text-[10px] text-gray-900/60 dark:text-white/60 mb-2">@{entries[0].username}</p>
              <div className="rounded-t-xl bg-gradient-to-b from-yellow-400 to-yellow-600 pt-4 pb-2 px-2">
                <Crown size={22} className="mx-auto text-white mb-1" />
                <p className="text-xl font-black text-white">#1</p>
                <p className="text-xs text-white font-bold flex items-center gap-1"><Flame size={12} /> {entries[0].drip_count}</p>
              </div>
            </div>

            {/* #3 — Bronze */}
            <div className="w-[115px] text-center">
              <img
                src={entries[2].avatar_url || "/default-avatar.png"}
                alt=""
                className="w-16 h-14 rounded-full object-cover mx-auto border-[3px] border-amber-700 mb-2"
              />
              <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{entries[2].display_name}</p>
              <p className="text-[10px] text-gray-900 dark:text-white mb-2">@{entries[2].username}</p>
              <div className="rounded-t-xl bg-gradient-to-b from-amber-700 to-amber-900 pt-3 pb-2 px-2">
                <Award size={18} className="mx-auto text-white mb-1" />
                <p className="text-lg font-black text-white">#3</p>
                <p className="text-[11px] text-white font-bold flex items-center gap-1"><Flame size={10} /> {entries[2].drip_count}</p>
              </div>
            </div>
          </div>
        )}

        {/* FULL LIST */}
        <div className="space-y-2">
          <h2 className="text-xs font-semibold text-text-t uppercase tracking-wider mb-3 px-1">
            Rankings
          </h2>
          {entries.map((entry) => (
            <div
              key={entry.user_id}
              className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                entry.isCurrentUser
                  ? "border-amber-500/40 bg-amber-950/20"
                  : "border-border-s bg-bg-raised"
              }`}
            >
              {/* RANK */}
              <div className="w-8 flex items-center justify-center shrink-0">
                {getRankIcon(entry.rank)}
              </div>

              {/* AVATAR + NAME */}
              <Link
                href={`/profile/${entry.username}`}
                className="flex items-center gap-2.5 flex-1 min-w-0"
              >
                <img
                  src={entry.avatar_url || "/default-avatar.png"}
                  alt=""
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {entry.display_name}
                    {entry.isCurrentUser && (
                      <span className="ml-1.5 text-[10px] text-amber-400">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-text-t truncate">@{entry.username}</p>
                </div>
              </Link>

              {/* STATS */}
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <Flame size={12} className="text-cyan-400" />
                    <span className="text-sm font-bold text-cyan-400">{entry.drip_count}</span>
                  </div>
                  <p className="text-[10px] text-text-m">{entry.post_count} posts</p>
                </div>
                <div className="w-12">
                  <div className="h-1.5 rounded-full bg-bg-sunken/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-400"
                      style={{ width: `${entry.drip_ratio * 100}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-text-m text-center mt-0.5">
                    {(entry.drip_ratio * 100).toFixed(0)}%
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {entries.length === 0 && (
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <Trophy size={32} className="mx-auto text-text-m mb-4" />
            <h3 className="font-semibold font-display">No rankings yet</h3>
            <p className="text-sm text-text-t mt-2">
              Votes cast this week will appear on the leaderboard.
            </p>
          </div>
        )}

        {useMock && (
          <div className="mt-6 rounded-xl border border-amber-900/30 bg-amber-950/20 p-4 text-center">
            <p className="text-xs text-amber-400/80">
              Leaderboard database tables not set up yet. Running in demo mode.
            </p>
            <p className="text-[10px] text-text-m mt-1">
              Run the SQL migration in supabase/migrations/create_competitions_tables.sql to enable real leaderboards.
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

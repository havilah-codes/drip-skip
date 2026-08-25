"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Swords,
  Trophy,
  Clock,
  Flame,
  Loader2,
  Zap,
  Timer,
  BarChart3,
  SkipForward,
  Check,
  Crown,
  RefreshCw,
} from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import BottomNav from "@/components/BottomNav";
import VideoPlayer from "@/components/VideoPlayer";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type PostWithStats = {
  id: string;
  user_id: string;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  profiles: Profile | null;
  drip_count: number;
  skip_count: number;
  total_votes: number;
  drip_ratio: number;
  engagement_score: number;
};

type Battle = {
  id: string;
  postA: PostWithStats;
  postB: PostWithStats;
  votesA: number;
  votesB: number;
  userVote: "a" | "b" | null;
  endsAt: Date;
  createdAt: Date;
};

const BATTLE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours
const MIN_POSTS_FOR_BATTLES = 2;

// ==========================================
// MATCHMAKING ALGORITHM
// ==========================================
//
// The goal: pair two fits that are most likely to create an interesting,
// close battle. We score candidates and find optimal pairings.
//
// Factors:
// 1. Similar engagement levels (posts with comparable vote counts)
// 2. Similar drip ratios (close win rates make tense battles)
// 3. Both must have visual media (images/videos) — text-only posts are boring in a VS layout
// 4. Different users (no self-battles)
// 5. Recency bonus (newer posts get a slight boost)
// 6. Already-battled penalty (posts already in an active battle get penalized)
//
// Algorithm: greedy matching on a sorted candidate list,
// pairing the closest matches by engagement score.

function computeEngagementScore(post: {
  drip_count: number;
  skip_count: number;
  created_at: string;
}): number {
  const total = post.drip_count + post.skip_count;
  // Engagement = volume + quality
  // Volume: logarithmic scale so viral posts don't dominate
  const volumeScore = Math.log2(total + 1) * 10;
  // Quality: drip ratio contributes up to 20 points
  const qualityScore = total > 0 ? (post.drip_count / total) * 20 : 10;
  // Recency: posts from last 24h get a 5-point bonus
  const ageHours =
    (Date.now() - new Date(post.created_at).getTime()) / (1000 * 60 * 60);
  const recencyBonus = Math.max(0, 5 - ageHours * 0.2);

  return volumeScore + qualityScore + recencyBonus;
}

function matchBattlePairs(
  candidates: PostWithStats[],
  activeBattlePostIds: Set<string>
): [PostWithStats, PostWithStats][] {
  // Filter: must have media, different users, not already in a battle
  const eligible = candidates.filter(
    (p) =>
      (p.image_url || p.video_url) &&
      !activeBattlePostIds.has(p.id)
  );

  if (eligible.length < MIN_POSTS_FOR_BATTLES) return [];

  // Sort by engagement score for consistent ordering
  eligible.sort((a, b) => b.engagement_score - a.engagement_score);

  const pairs: [PostWithStats, PostWithStats][] = [];
  const used = new Set<string>();

  // Greedy matching: walk through sorted list, find closest unused neighbor
  for (let i = 0; i < eligible.length && pairs.length < 5; i++) {
    const a = eligible[i];
    if (used.has(a.id)) continue;

    let bestMatch: PostWithStats | null = null;
    let bestScore = Infinity;

    for (let j = i + 1; j < eligible.length; j++) {
      const b = eligible[j];
      if (used.has(b.id)) continue;
      if (a.user_id === b.user_id) continue;

      // Score: lower = better matchup
      // Distance in engagement + distance in drip ratio
      const engagementDiff = Math.abs(
        a.engagement_score - b.engagement_score
      );
      const ratioDiff = Math.abs(a.drip_ratio - b.drip_ratio);
      const matchupScore = engagementDiff + ratioDiff * 5; // ratio matters more

      if (matchupScore < bestScore) {
        bestScore = matchupScore;
        bestMatch = b;
      }
    }

    if (bestMatch) {
      used.add(a.id);
      used.add(bestMatch.id);
      pairs.push([a, bestMatch]);
    }
  }

  return pairs;
}

// ==========================================
// COUNTDOWN HOOK
// ==========================================

function useCountdown(targetDate: Date) {
  const [timeLeft, setTimeLeft] = useState(() => {
    const diff = targetDate.getTime() - Date.now();
    if (diff <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true };
    return {
      hours: Math.floor(diff / 3600_000),
      minutes: Math.floor((diff % 3600_000) / 60_000),
      seconds: Math.floor((diff % 60_000) / 1000),
      expired: false,
    };
  });

  useEffect(() => {
    const interval = setInterval(() => {
      const diff = targetDate.getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, expired: true });
        clearInterval(interval);
        return;
      }
      setTimeLeft({
        hours: Math.floor(diff / 3600_000),
        minutes: Math.floor((diff % 3600_000) / 60_000),
        seconds: Math.floor((diff % 60_000) / 1000),
        expired: false,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [targetDate]);

  return timeLeft;
}

// ==========================================
// BATTLE CARD COMPONENT
// ==========================================

function BattleCard({
  battle,
  onVote,
  voting,
  isLocked,
}: {
  battle: Battle;
  onVote: (battleId: string, side: "a" | "b") => void;
  voting: string | null;
  isLocked: boolean;
}) {
  const countdown = useCountdown(battle.endsAt);
  const totalVotes = battle.votesA + battle.votesB;
  const pctA = totalVotes > 0 ? (battle.votesA / totalVotes) * 100 : 50;
  const pctB = totalVotes > 0 ? (battle.votesB / totalVotes) * 100 : 50;
  const isVotingThis = voting === battle.id;

  const formatCountdown = () => {
    if (countdown.expired) return "Battle ended";
    if (countdown.hours > 0) {
      return `${countdown.hours}h ${countdown.minutes}m ${countdown.seconds}s`;
    }
    return `${countdown.minutes}m ${countdown.seconds}s`;
  };

  const renderSide = (
    side: "a" | "b",
    post: PostWithStats,
    votes: number,
    pct: number,
    colorClass: string,
    fillClass: string
  ) => {
    const isWinner = battle.userVote === side;
    const isLoser = battle.userVote && battle.userVote !== side;
    const profile = post.profiles;

    return (
      <div className={`relative ${side === "b" ? "border-l border-border-s" : ""}`}>
        {/* YOUR PICK badge */}
        {isWinner && (
          <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center gap-1">
            <Check size={10} strokeWidth={3} />
            YOUR PICK
          </div>
        )}

        <button
          type="button"
          onClick={() => !countdown.expired && onVote(battle.id, side)}
          disabled={!!battle.userVote || isVotingThis || countdown.expired || isLocked}
          className={`w-full text-left transition-all active:scale-[0.98] ${
            isWinner
              ? "ring-2 ring-amber-500"
              : isLoser
              ? "opacity-40"
              : "hover:bg-bg-sunken/30"
          }`}
        >
          <div className="p-3">
            {/* User info */}
            <div className="flex items-center gap-2 mb-2">
              <img
                src={profile?.avatar_url || "/default-avatar.png"}
                alt=""
                className="w-7 h-7 rounded-full object-cover"
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">
                  {profile?.display_name || "Anonymous"}
                </p>
                <p className="text-[10px] text-text-t">
                  @{profile?.username || "user"}
                </p>
              </div>
            </div>

            {/* Media */}
            {post.image_url && (
              <img
                src={post.image_url}
                alt=""
                className="w-full aspect-square object-cover rounded-xl mb-2"
              />
            )}
            {post.video_url && (
              <div className="mb-2 rounded-xl overflow-hidden">
                <VideoPlayer
                  src={post.video_url}
                  className="w-full aspect-square"
                />
              </div>
            )}
            {!post.image_url && !post.video_url && (
              <div className="w-full aspect-square rounded-xl bg-bg-sunken/50 flex items-center justify-center mb-2">
                <Flame size={32} className="text-text-m/30" />
              </div>
            )}

            {/* Caption */}
            {post.text && (
              <p className="text-xs text-text-s line-clamp-2">{post.text}</p>
            )}
          </div>
        </button>

        {/* Vote bar */}
        <div className="px-3 pb-3">
          <div className="h-1.5 rounded-full bg-bg-sunken/50 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${fillClass}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <div className="flex items-center gap-1">
              <Flame size={12} className={colorClass} />
              <span className={`text-[11px] font-bold ${colorClass}`}>
                {votes}
              </span>
            </div>
            <span className="text-[10px] text-text-m">
              {pct.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden">
      {/* Battle header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border-s/50">
        <div className="flex items-center gap-2">
          <Timer size={14} className={countdown.expired ? "text-text-m" : "text-amber-400"} />
          <span
            className={`text-xs font-medium tabular-nums ${
              countdown.expired ? "text-text-m" : "text-text-s"
            }`}
          >
            {formatCountdown()}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-text-m">
            {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
          </span>
          {countdown.expired && (
            <span className="px-2 py-0.5 rounded-full bg-zinc-800 text-[10px] font-bold text-text-m">
              ENDED
            </span>
          )}
        </div>
      </div>

      {/* VS layout */}
      <div className="grid grid-cols-2">
        {renderSide(
          "a",
          battle.postA,
          battle.votesA,
          pctA,
          "text-cyan-400",
          "bg-cyan-400"
        )}
        {renderSide(
          "b",
          battle.postB,
          battle.votesB,
          pctB,
          "text-rose-400",
          "bg-rose-400"
        )}
      </div>

      {/* Winner announcement (when ended) */}
      {countdown.expired && totalVotes > 0 && (
        <div className="px-4 py-3 border-t border-border-s/50 text-center">
          <p className="text-xs text-text-m">
            {battle.votesA > battle.votesB ? (
              <span className="text-cyan-400 font-semibold">
                {battle.postA.profiles?.display_name || "Post A"} wins
              </span>
            ) : battle.votesB > battle.votesA ? (
              <span className="text-rose-400 font-semibold">
                {battle.postB.profiles?.display_name || "Post B"} wins
              </span>
            ) : (
              <span className="font-semibold">Tie</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

// ==========================================
// MAIN PAGE
// ==========================================

export default function BattlesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [completedBattles, setCompletedBattles] = useState<Battle[]>([]);
  const [voting, setVoting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [generating, setGenerating] = useState(false);
  const [noPosts, setNoPosts] = useState(false);
  const battleSeedRef = useRef(Date.now());

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

  const loadBattles = useCallback(async () => {
    if (!user) return;

    try {
      // Step 1: Fetch recent posts with media
      const sevenDaysAgo = new Date(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      ).toISOString();

      const { data: postsData, error: postsError } = await supabase
        .from("posts")
        .select(
          `
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
        `
        )
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(100);

      if (postsError) throw postsError;

      if (!postsData || postsData.length < 2) {
        setNoPosts(true);
        setBattles([]);
        setCompletedBattles([]);
        setLoading(false);
        return;
      }

      // Step 2: Fetch vote stats for all posts
      const postIds = postsData.map((p) => p.id);
      const { data: votesData } = await supabase
        .from("votes")
        .select("fit_id, vote")
        .in("fit_id", postIds);

      // Aggregate votes
      const voteMap: Record<string, { drip: number; skip: number }> = {};
      votesData?.forEach((v) => {
        if (!voteMap[v.fit_id]) voteMap[v.fit_id] = { drip: 0, skip: 0 };
        if (v.vote === "drip") voteMap[v.fit_id].drip++;
        if (v.vote === "skip") voteMap[v.fit_id].skip++;
      });

      // Enrich posts with stats
      const enriched: PostWithStats[] = postsData.map((post) => {
        const stats = voteMap[post.id] || { drip: 0, skip: 0 };
        const total = stats.drip + stats.skip;
        const withStats = {
          ...post,
          profiles: Array.isArray(post.profiles)
            ? post.profiles[0]
            : post.profiles,
          drip_count: stats.drip,
          skip_count: stats.skip,
          total_votes: total,
          drip_ratio: total > 0 ? stats.drip / total : 0.5,
          engagement_score: 0,
        };
        withStats.engagement_score = computeEngagementScore(withStats);
        return withStats;
      });

      // Step 3: Check for existing active battles in DB
      let activeBattlePostIds = new Set<string>();
      const existingBattles: Battle[] = [];

      try {
        const { data: dbBattles } = await supabase
          .from("battles")
          .select("*")
          .eq("status", "active")
          .gt("ends_at", new Date().toISOString());

        if (dbBattles && dbBattles.length > 0) {
          for (const db of dbBattles) {
            activeBattlePostIds.add(db.post_a_id);
            activeBattlePostIds.add(db.post_b_id);

            const postA = enriched.find((p) => p.id === db.post_a_id);
            const postB = enriched.find((p) => p.id === db.post_b_id);

            if (postA && postB) {
              // Fetch votes for this battle
              const [votesARes, votesBRes] = await Promise.all([
                supabase
                  .from("battle_votes")
                  .select("id")
                  .eq("battle_id", db.id)
                  .eq("chosen_post_id", db.post_a_id),
                supabase
                  .from("battle_votes")
                  .select("id")
                  .eq("battle_id", db.id)
                  .eq("chosen_post_id", db.post_b_id),
              ]);

              const profile = await syncProfile(firebaseAuth.currentUser!);
              let userVote: "a" | "b" | null = null;
              if (profile?.id) {
                const { data: uv } = await supabase
                  .from("battle_votes")
                  .select("chosen_post_id")
                  .eq("battle_id", db.id)
                  .eq("user_id", profile.id)
                  .maybeSingle();
                if (uv) {
                  userVote =
                    uv.chosen_post_id === db.post_a_id ? "a" : "b";
                }
              }

              existingBattles.push({
                id: db.id,
                postA,
                postB,
                votesA: votesARes.data?.length || 0,
                votesB: votesBRes.data?.length || 0,
                userVote,
                endsAt: new Date(db.ends_at),
                createdAt: new Date(db.created_at),
              });
            }
          }
        }
      } catch {
        // battles table doesn't exist — generate client-side battles
      }

      // Step 4: Generate new matchups from unmatched posts
      const newPairs = matchBattlePairs(enriched, activeBattlePostIds);

      const generatedBattles: Battle[] = newPairs.map(([a, b], index) => ({
        id: `gen-${battleSeedRef.current}-${index}`,
        postA: a,
        postB: b,
        votesA: 0,
        votesB: 0,
        userVote: null,
        endsAt: new Date(Date.now() + BATTLE_DURATION_MS),
        createdAt: new Date(),
      }));

      // Combine DB battles + generated battles
      const allActive = [...existingBattles, ...generatedBattles];

      // Step 5: Build completed battles (from DB only)
      const completedList: Battle[] = [];
      try {
        const { data: completedData } = await supabase
          .from("battles")
          .select("*")
          .eq("status", "completed")
          .order("ends_at", { ascending: false })
          .limit(10);

        if (completedData) {
          for (const db of completedData) {
            const postA = enriched.find((p) => p.id === db.post_a_id);
            const postB = enriched.find((p) => p.id === db.post_b_id);

            if (postA && postB) {
              const [votesARes, votesBRes] = await Promise.all([
                supabase
                  .from("battle_votes")
                  .select("id")
                  .eq("battle_id", db.id)
                  .eq("chosen_post_id", db.post_a_id),
                supabase
                  .from("battle_votes")
                  .select("id")
                  .eq("battle_id", db.id)
                  .eq("chosen_post_id", db.post_b_id),
              ]);

              completedList.push({
                id: db.id,
                postA,
                postB,
                votesA: votesARes.data?.length || 0,
                votesB: votesBRes.data?.length || 0,
                userVote: null,
                endsAt: new Date(db.ends_at),
                createdAt: new Date(db.created_at),
              });
            }
          }
        }
      } catch {
        // ignore
      }

      setBattles(allActive);
      setCompletedBattles(completedList);
      setNoPosts(enriched.filter((p) => p.image_url || p.video_url).length < 2);
    } catch (err) {
      console.error("Failed to load battles:", err);
    } finally {
      setLoading(false);
      setGenerating(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      loadBattles();
    }
  }, [user, loadBattles]);

  const handleVote = async (battleId: string, side: "a" | "b") => {
    if (voting || !user) return;

    const battle = [...battles, ...completedBattles].find(
      (b) => b.id === battleId
    );
    if (!battle || battle.userVote) return;

    setVoting(battleId);

    // Optimistic update
    const updateBattle = (list: Battle[]) =>
      list.map((b) => {
        if (b.id !== battleId) return b;
        return {
          ...b,
          userVote: side,
          votesA: side === "a" ? b.votesA + 1 : b.votesA,
          votesB: side === "b" ? b.votesB + 1 : b.votesB,
        };
      });

    setBattles((prev) => updateBattle(prev));
    setCompletedBattles((prev) => updateBattle(prev));

    // Try to persist to DB
    try {
      const profile = await syncProfile(user);
      if (!profile?.id) throw new Error("No profile");

      const chosenPostId =
        side === "a" ? battle.postA.id : battle.postB.id;

      // If this is a real DB battle, save the vote
      if (!battleId.startsWith("gen-")) {
        const { error } = await supabase.from("battle_votes").insert({
          battle_id: battleId,
          user_id: profile.id,
          chosen_post_id: chosenPostId,
        });

        if (error && error.code !== "23505") throw error;
      }
    } catch (err) {
      console.error("Battle vote failed:", err);
      // Revert
      const revertBattle = (list: Battle[]) =>
        list.map((b) => {
          if (b.id !== battleId) return b;
          return {
            ...b,
            userVote: null,
            votesA: side === "a" ? b.votesA - 1 : b.votesA,
            votesB: side === "b" ? b.votesB - 1 : b.votesB,
          };
        });
      setBattles((prev) => revertBattle(prev));
      setCompletedBattles((prev) => revertBattle(prev));
    } finally {
      setVoting(null);
    }
  };

  const handleRefresh = () => {
    setGenerating(true);
    battleSeedRef.current = Date.now();
    loadBattles();
  };

  const displayBattles = activeTab === "active" ? battles : completedBattles;

  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-28">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            <Swords size={20} className="text-amber-400" />
            <h1 className="text-lg font-bold font-display">Fit Battles</h1>
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
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Swords size={20} className="text-amber-400" />
            <h1 className="text-lg font-bold font-display">Fit Battles</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/leaderboard"
              className="flex items-center gap-1.5 text-xs font-medium text-text-s hover:text-text-p transition-colors"
            >
              <Trophy size={14} />
              Leaderboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* HERO */}
        <section className="mb-6 rounded-2xl bg-gradient-to-br from-amber-950/40 to-rose-950/30 border border-amber-900/30 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Zap size={20} className="text-amber-400" />
            <h2 className="text-lg font-bold font-display">
              Two Fits. One Winner.
            </h2>
          </div>
          <p className="text-sm text-text-s">
            The algorithm pairs comparable fits head-to-head. You have 24 hours
            to vote before each battle expires.
          </p>
        </section>

        {/* TABS + REFRESH */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex-1 flex items-center gap-1 bg-bg-raised border border-border-s rounded-xl p-1">
            {(["active", "completed"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === tab
                    ? "bg-btn text-btn-text"
                    : "text-text-t hover:text-text-p"
                }`}
              >
                {tab === "active" ? "Active" : "Completed"}
              </button>
            ))}
          </div>
          {activeTab === "active" && (
            <button
              type="button"
              onClick={handleRefresh}
              disabled={generating}
              className="w-10 h-10 rounded-xl border border-border-s bg-bg-raised flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-all disabled:opacity-50"
              aria-label="Generate new matchups"
            >
              <RefreshCw
                size={16}
                className={generating ? "animate-spin" : ""}
              />
            </button>
          )}
        </div>

        {/* BATTLES */}
        {noPosts && displayBattles.length === 0 ? (
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <Swords size={32} className="mx-auto text-text-m mb-4" />
            <h3 className="font-semibold font-display">No battles yet</h3>
            <p className="text-sm text-text-t mt-2">
              Need at least 2 posts with photos or videos to create battles.
              Post some fits to get started.
            </p>
            <Link
              href="/feed"
              className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-btn text-btn-text text-sm font-bold active:scale-95 transition-all"
            >
              Create a post
            </Link>
          </div>
        ) : displayBattles.length === 0 ? (
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <Swords size={32} className="mx-auto text-text-m mb-4" />
            <h3 className="font-semibold font-display">
              {activeTab === "active"
                ? "No active battles"
                : "No completed battles"}
            </h3>
            <p className="text-sm text-text-t mt-2">
              {activeTab === "active"
                ? "Hit refresh to generate new matchups."
                : "Completed battles will appear here."}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {displayBattles.map((battle, index) => (
              <BattleCard
                key={battle.id}
                battle={battle}
                onVote={handleVote}
                voting={voting}
                isLocked={false}
              />
            ))}
          </div>
        )}

        {/* Stats bar */}
        {displayBattles.length > 0 && (
          <div className="mt-6 flex items-center justify-center gap-4 text-xs text-text-m">
            <div className="flex items-center gap-1">
              <BarChart3 size={12} />
              <span>
                {displayBattles.length} battle
                {displayBattles.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <Clock size={12} />
              <span>24h time limit</span>
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

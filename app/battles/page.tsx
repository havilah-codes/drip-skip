"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Swords,
  Trophy,
  Clock,
  Flame,
  SkipForward,
  Check,
  Loader2,
  ChevronRight,
  Zap,
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

type BattlePost = {
  id: string;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  profiles: Profile | Profile[] | null;
};

type Battle = {
  id: string;
  post_a_id: string;
  post_b_id: string;
  status: string;
  ends_at: string;
  created_at: string;
  post_a: BattlePost;
  post_b: BattlePost;
  votes_a: number;
  votes_b: number;
  userVote: string | null;
};

// ==========================================
// MOCK BATTLES (used when DB tables don't exist yet)
// ==========================================

const MOCK_BATTLES: Battle[] = [
  {
    id: "mock-1",
    post_a_id: "a1",
    post_b_id: "b1",
    status: "active",
    ends_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
    post_a: {
      id: "a1",
      text: "Summer streetwear vibes 🌴",
      image_url: null,
      video_url: null,
      profiles: { id: "u1", username: "fitking", display_name: "Marcus Reed", avatar_url: null },
    },
    post_b: {
      id: "b1",
      text: "Minimal black on black fit",
      image_url: null,
      video_url: null,
      profiles: { id: "u2", username: "stylequeen", display_name: "Aria Chen", avatar_url: null },
    },
    votes_a: 24,
    votes_b: 18,
    userVote: null,
  },
  {
    id: "mock-2",
    post_a_id: "a2",
    post_b_id: "b2",
    status: "active",
    ends_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
    created_at: new Date(Date.now() - 5 * 3600_000).toISOString(),
    post_a: {
      id: "a2",
      text: "Vintage denim jacket layered over white tee",
      image_url: null,
      video_url: null,
      profiles: { id: "u3", username: "denimhead", display_name: "Jake Wilson", avatar_url: null },
    },
    post_b: {
      id: "b2",
      text: "Neon accent sporty look",
      image_url: null,
      video_url: null,
      profiles: { id: "u4", username: "neonvibes", display_name: "Sofia Reyes", avatar_url: null },
    },
    votes_a: 31,
    votes_b: 42,
    userVote: null,
  },
];

export default function BattlesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [battles, setBattles] = useState<Battle[]>([]);
  const [voting, setVoting] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
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

  const loadBattles = useCallback(async () => {
    try {
      // Try fetching real battles
      const { data: battlesData, error } = await supabase
        .from("battles")
        .select("*")
        .eq("status", activeTab === "active" ? "active" : "completed")
        .order("created_at", { ascending: false })
        .limit(20);

      if (error || !battlesData || battlesData.length === 0) {
        setUseMock(true);
        setBattles(MOCK_BATTLES);
        setLoading(false);
        return;
      }

      // Fetch posts for each battle
      const enriched = await Promise.all(
        battlesData.map(async (b) => {
          const [postARes, postBRes, votesARes, votesBRes] = await Promise.all([
            supabase.from("posts").select("id, text, image_url, video_url, profiles(id, username, display_name, avatar_url)").eq("id", b.post_a_id).single(),
            supabase.from("posts").select("id, text, image_url, video_url, profiles(id, username, display_name, avatar_url)").eq("id", b.post_b_id).single(),
            supabase.from("battle_votes").select("id").eq("battle_id", b.id).eq("chosen_post_id", b.post_a_id),
            supabase.from("battle_votes").select("id").eq("battle_id", b.id).eq("chosen_post_id", b.post_b_id),
          ]);

          const profile = await syncProfile(firebaseAuth.currentUser!);
          let userVote: string | null = null;
          if (profile?.id) {
            const { data: uv } = await supabase
              .from("battle_votes")
              .select("chosen_post_id")
              .eq("battle_id", b.id)
              .eq("user_id", profile.id)
              .maybeSingle();
            if (uv) userVote = uv.chosen_post_id;
          }

          return {
            ...b,
            post_a: postARes.data || { id: b.post_a_id, text: "", image_url: null, video_url: null, profiles: null },
            post_b: postBRes.data || { id: b.post_b_id, text: "", image_url: null, video_url: null, profiles: null },
            votes_a: votesARes.data?.length || 0,
            votes_b: votesBRes.data?.length || 0,
            userVote,
          };
        })
      );

      setBattles(enriched);
    } catch {
      setUseMock(true);
      setBattles(MOCK_BATTLES);
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      loadBattles();
    }
  }, [user, loadBattles]);

  const handleVote = async (battleId: string, chosenPostId: string) => {
    if (voting || !user) return;

    const battle = battles.find((b) => b.id === battleId);
    if (!battle || battle.userVote) return;

    setVoting(battleId);

    // Optimistic update
    setBattles((prev) =>
      prev.map((b) => {
        if (b.id !== battleId) return b;
        return {
          ...b,
          userVote: chosenPostId,
          votes_a: chosenPostId === b.post_a_id ? b.votes_a + 1 : b.votes_a,
          votes_b: chosenPostId === b.post_b_id ? b.votes_b + 1 : b.votes_b,
        };
      })
    );

    try {
      const profile = await syncProfile(user);
      if (!profile?.id) throw new Error("No profile");

      const { error } = await supabase.from("battle_votes").insert({
        battle_id: battleId,
        user_id: profile.id,
        chosen_post_id: chosenPostId,
      });

      if (error && error.code !== "23505") throw error;
    } catch (err) {
      console.error("Battle vote failed:", err);
      // Revert
      setBattles((prev) =>
        prev.map((b) => {
          if (b.id !== battleId) return b;
          return {
            ...b,
            userVote: null,
            votes_a: chosenPostId === b.post_a_id ? b.votes_a - 1 : b.votes_a,
            votes_b: chosenPostId === b.post_b_id ? b.votes_b - 1 : b.votes_b,
          };
        })
      );
    } finally {
      setVoting(null);
    }
  };

  const getTimeLeft = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return "Ended";
    const hours = Math.floor(diff / 3600_000);
    const mins = Math.floor((diff % 3600_000) / 60_000);
    if (hours > 24) return `${Math.floor(hours / 24)}d left`;
    if (hours > 0) return `${hours}h ${mins}m left`;
    return `${mins}m left`;
  };

  const getProfile = (post: BattlePost) => {
    const p = post.profiles;
    if (!p) return { name: "Anonymous", username: "anon", avatar: "/default-avatar.png" };
    const prof = Array.isArray(p) ? p[0] : p;
    return {
      name: prof?.display_name || "Anonymous",
      username: prof?.username || "anon",
      avatar: prof?.avatar_url || "/default-avatar.png",
    };
  };

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
          <Link
            href="/leaderboard"
            className="flex items-center gap-1.5 text-xs font-medium text-text-s hover:text-text-p transition-colors"
          >
            <Trophy size={14} />
            Leaderboard
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* HERO */}
        <section className="mb-6 rounded-2xl bg-gradient-to-br from-amber-950/40 to-rose-950/30 border border-amber-900/30 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Zap size={20} className="text-amber-400" />
            <h2 className="text-lg font-bold font-display">Two Fits. One Winner.</h2>
          </div>
          <p className="text-sm text-text-s">
            Vote for the best fit. The community decides who drips and who skips.
          </p>
        </section>

        {/* TABS */}
        <div className="flex items-center gap-1 mb-6 bg-bg-raised border border-border-s rounded-xl p-1">
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
              {tab === "active" ? "🔥 Active" : "✅ Completed"}
            </button>
          ))}
        </div>

        {/* BATTLES */}
        {battles.length === 0 ? (
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <Swords size={32} className="mx-auto text-text-m mb-4" />
            <h3 className="font-semibold font-display">No battles yet</h3>
            <p className="text-sm text-text-t mt-2">
              Battles will appear here when there are enough posts to matchup.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {battles.map((battle) => {
              const totalVotes = battle.votes_a + battle.votes_b;
              const pctA = totalVotes > 0 ? (battle.votes_a / totalVotes) * 100 : 50;
              const pctB = totalVotes > 0 ? (battle.votes_b / totalVotes) * 100 : 50;
              const profileA = getProfile(battle.post_a);
              const profileB = getProfile(battle.post_b);

              return (
                <div
                  key={battle.id}
                  className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden"
                >
                  {/* BATTLE HEADER */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border-s/50">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-amber-400" />
                      <span className="text-xs font-medium text-text-s">
                        {getTimeLeft(battle.ends_at)}
                      </span>
                    </div>
                    <span className="text-xs text-text-m">
                      {totalVotes} vote{totalVotes !== 1 ? "s" : ""}
                    </span>
                  </div>

                  {/* VS LAYOUT */}
                  <div className="grid grid-cols-2 divide-x divide-border-s">
                    {/* POST A */}
                    <div className="relative">
                      {battle.userVote === battle.post_a_id && (
                        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold">
                          YOUR PICK
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleVote(battle.id, battle.post_a_id)}
                        disabled={!!battle.userVote || voting === battle.id || activeTab === "completed"}
                        className={`w-full text-left transition-all active:scale-[0.98] ${
                          battle.userVote === battle.post_a_id
                            ? "ring-2 ring-amber-500"
                            : battle.userVote
                            ? "opacity-50"
                            : "hover:bg-bg-sunken/30"
                        }`}
                      >
                        <div className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <img
                              src={profileA.avatar}
                              alt={profileA.name}
                              className="w-7 h-7 rounded-full object-cover"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{profileA.name}</p>
                              <p className="text-[10px] text-text-t">@{profileA.username}</p>
                            </div>
                          </div>
                          {battle.post_a.image_url && (
                            <img
                              src={battle.post_a.image_url}
                              alt=""
                              className="w-full aspect-square object-cover rounded-xl mb-2"
                            />
                          )}
                          {battle.post_a.video_url && (
                            <div className="mb-2 rounded-xl overflow-hidden">
                              <VideoPlayer src={battle.post_a.video_url} className="w-full aspect-square" />
                            </div>
                          )}
                          {!battle.post_a.image_url && !battle.post_a.video_url && (
                            <div className="w-full aspect-square rounded-xl bg-bg-sunken/50 flex items-center justify-center mb-2">
                              <Flame size={32} className="text-cyan-400/30" />
                            </div>
                          )}
                          {battle.post_a.text && (
                            <p className="text-xs text-text-s line-clamp-2">{battle.post_a.text}</p>
                          )}
                        </div>
                      </button>
                      {/* VOTE BAR A */}
                      <div className="px-3 pb-3">
                        <div className="h-1.5 rounded-full bg-bg-sunken/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-cyan-400 transition-all duration-500"
                            style={{ width: `${pctA}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex items-center gap-1">
                            <Flame size={12} className="text-cyan-400" />
                            <span className="text-[11px] font-bold text-cyan-400">
                              {battle.votes_a}
                            </span>
                          </div>
                          <span className="text-[10px] text-text-m">{pctA.toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>

                    {/* POST B */}
                    <div className="relative">
                      {battle.userVote === battle.post_b_id && (
                        <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded-full bg-amber-500 text-black text-[10px] font-bold">
                          YOUR PICK
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleVote(battle.id, battle.post_b_id)}
                        disabled={!!battle.userVote || voting === battle.id || activeTab === "completed"}
                        className={`w-full text-left transition-all active:scale-[0.98] ${
                          battle.userVote === battle.post_b_id
                            ? "ring-2 ring-amber-500"
                            : battle.userVote
                            ? "opacity-50"
                            : "hover:bg-bg-sunken/30"
                        }`}
                      >
                        <div className="p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <img
                              src={profileB.avatar}
                              alt={profileB.name}
                              className="w-7 h-7 rounded-full object-cover"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{profileB.name}</p>
                              <p className="text-[10px] text-text-t">@{profileB.username}</p>
                            </div>
                          </div>
                          {battle.post_b.image_url && (
                            <img
                              src={battle.post_b.image_url}
                              alt=""
                              className="w-full aspect-square object-cover rounded-xl mb-2"
                            />
                          )}
                          {battle.post_b.video_url && (
                            <div className="mb-2 rounded-xl overflow-hidden">
                              <VideoPlayer src={battle.post_b.video_url} className="w-full aspect-square" />
                            </div>
                          )}
                          {!battle.post_b.image_url && !battle.post_b.video_url && (
                            <div className="w-full aspect-square rounded-xl bg-bg-sunken/50 flex items-center justify-center mb-2">
                              <SkipForward size={32} className="text-rose-400/30" />
                            </div>
                          )}
                          {battle.post_b.text && (
                            <p className="text-xs text-text-s line-clamp-2">{battle.post_b.text}</p>
                          )}
                        </div>
                      </button>
                      {/* VOTE BAR B */}
                      <div className="px-3 pb-3">
                        <div className="h-1.5 rounded-full bg-bg-sunken/50 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-rose-400 transition-all duration-500"
                            style={{ width: `${pctB}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between mt-1.5">
                          <div className="flex items-center gap-1">
                            <Flame size={12} className="text-rose-400" />
                            <span className="text-[11px] font-bold text-rose-400">
                              {battle.votes_b}
                            </span>
                          </div>
                          <span className="text-[10px] text-text-m">{pctB.toFixed(0)}%</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* VS BADGE */}
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none hidden">
                    <div className="w-10 h-10 rounded-full bg-bg-raised border-2 border-amber-500 flex items-center justify-center">
                      <span className="text-xs font-black text-amber-400">VS</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {useMock && (
          <div className="mt-6 rounded-xl border border-amber-900/30 bg-amber-950/20 p-4 text-center">
            <p className="text-xs text-amber-400/80">
              ⚡ Battles database tables not set up yet. Running in demo mode.
            </p>
            <p className="text-[10px] text-text-m mt-1">
              Run the SQL migration in supabase/migrations/create_competitions_tables.sql to enable real battles.
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

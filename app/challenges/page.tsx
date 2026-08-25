"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Trophy,
  Flame,
  Clock,
  Loader2,
  Plus,
  ChevronRight,
  Check,
  Users,
  Sparkles,
  Shirt,
  Bike,
  Recycle,
  Briefcase,
  Coffee,
  Dumbbell,
  Clock3,
  Palette,
  Sparkle,
} from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import BottomNav from "@/components/BottomNav";
import PostCard from "@/components/PostCard";
import VideoPlayer from "@/components/VideoPlayer";

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

type ChallengeEntry = {
  id: string;
  challenge_id: string;
  user_id: string;
  post_id: string;
  created_at: string;
  post: {
    id: string;
    text: string | null;
    image_url: string | null;
    video_url: string | null;
    profiles: Profile | Profile[] | null;
  } | null;
  drip_count: number;
  skip_count: number;
};

type Challenge = {
  id: string;
  title: string;
  description: string | null;
  theme: string;
  status: string;
  starts_at: string;
  ends_at: string;
  entry_count: number;
  entries: ChallengeEntry[];
};

// ==========================================
// MOCK CHALLENGES
// ==========================================

const MOCK_CHALLENGES: Challenge[] = [
  {
    id: "ch-1",
    title: "All Black Everything",
    description: "Show us your best head-to-toe black fit. Monochrome only — no color allowed.",
    theme: "monochrome",
    status: "active",
    starts_at: new Date(Date.now() - 2 * 24 * 3600_000).toISOString(),
    ends_at: new Date(Date.now() + 5 * 24 * 3600_000).toISOString(),
    entry_count: 47,
    entries: [],
  },
  {
    id: "ch-2",
    title: "Summer Streetwear Showdown",
    description: "Heat up the streets. Show your freshest warm-weather streetwear look.",
    theme: "streetwear",
    status: "active",
    starts_at: new Date(Date.now() - 1 * 24 * 3600_000).toISOString(),
    ends_at: new Date(Date.now() + 6 * 24 * 3600_000).toISOString(),
    entry_count: 32,
    entries: [],
  },
  {
    id: "ch-3",
    title: "Thrift Flip Challenge",
    description: "Repped something from the thrift store? Show us how you styled it.",
    theme: "sustainable",
    status: "completed",
    starts_at: new Date(Date.now() - 14 * 24 * 3600_000).toISOString(),
    ends_at: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
    entry_count: 89,
    entries: [],
  },
];

const THEME_ICONS: Record<string, string> = {
  monochrome: "Circle",
  streetwear: "Flame",
  sustainable: "Recycle",
  formal: "Briefcase",
  casual: "Coffee",
  athletic: "Dumbbell",
  vintage: "Clock3",
  avantgarde: "Palette",
  default: "Shirt",
};

export default function ChallengesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [useMock, setUseMock] = useState(false);
  const [entryLoading, setEntryLoading] = useState<string | null>(null);

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

  const loadChallenges = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("challenges")
        .select("*")
        .eq("status", activeTab)
        .order("ends_at", { ascending: false })
        .limit(20);

      if (error || !data || data.length === 0) {
        setUseMock(true);
        setChallenges(MOCK_CHALLENGES.filter((c) => c.status === activeTab));
        setLoading(false);
        return;
      }

      // Fetch entry counts
      const enriched = await Promise.all(
        data.map(async (ch) => {
          const { count } = await supabase
            .from("challenge_entries")
            .select("id", { count: "exact", head: true })
            .eq("challenge_id", ch.id);

          return {
            ...ch,
            entry_count: count || 0,
            entries: [],
          };
        })
      );

      setChallenges(enriched);
    } catch {
      setUseMock(true);
      setChallenges(MOCK_CHALLENGES.filter((c) => c.status === activeTab));
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      loadChallenges();
    }
  }, [user, loadChallenges]);

  const loadChallengeEntries = async (challenge: Challenge) => {
    setSelectedChallenge(challenge);

    try {
      const { data: entriesData } = await supabase
        .from("challenge_entries")
        .select(`
          id,
          challenge_id,
          user_id,
          post_id,
          created_at,
          post:posts (
            id,
            text,
            image_url,
            video_url,
            profiles (
              id,
              username,
              display_name,
              avatar_url
            )
          )
        `)
        .eq("challenge_id", challenge.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!entriesData) return;

      // Fetch votes for entries
      const entryIds = entriesData.map((e) => e.id);
      const { data: votesData } = await supabase
        .from("challenge_votes")
        .select("entry_id, vote")
        .in("entry_id", entryIds);

      const voteMap: Record<string, { drip: number; skip: number }> = {};
      votesData?.forEach((v) => {
        if (!voteMap[v.entry_id]) voteMap[v.entry_id] = { drip: 0, skip: 0 };
        if (v.vote === "drip") voteMap[v.entry_id].drip++;
        if (v.vote === "skip") voteMap[v.entry_id].skip++;
      });

      const enriched: ChallengeEntry[] = entriesData.map((e) => ({
        ...e,
        post: Array.isArray(e.post) ? e.post[0] : e.post,
        drip_count: voteMap[e.id]?.drip || 0,
        skip_count: voteMap[e.id]?.skip || 0,
      }));

      // Sort by drip count
      enriched.sort((a, b) => b.drip_count - a.drip_count);

      setSelectedChallenge((prev) =>
        prev ? { ...prev, entries: enriched } : null
      );
    } catch (err) {
      console.error("Failed to load entries:", err);
    }
  };

  const handleVoteEntry = async (entryId: string, vote: "drip" | "skip") => {
    if (!user || entryLoading) return;
    setEntryLoading(entryId);

    try {
      const profile = await syncProfile(user);
      if (!profile?.id) throw new Error("No profile");

      const { error } = await supabase.from("challenge_votes").insert({
        entry_id: entryId,
        user_id: profile.id,
        vote,
      });

      if (error && error.code !== "23505") throw error;

      // Update local state
      setSelectedChallenge((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          entries: prev.entries.map((e) => {
            if (e.id !== entryId) return e;
            return {
              ...e,
              drip_count: vote === "drip" ? e.drip_count + 1 : e.drip_count,
              skip_count: vote === "skip" ? e.skip_count + 1 : e.skip_count,
            };
          }),
        };
      });
    } catch (err) {
      console.error("Challenge vote failed:", err);
    } finally {
      setEntryLoading(null);
    }
  };

  const getTimeLeft = (endsAt: string) => {
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return "Ended";
    const days = Math.floor(diff / (24 * 3600_000));
    const hours = Math.floor((diff % (24 * 3600_000)) / 3600_000);
    if (days > 0) return `${days}d ${hours}h left`;
    return `${hours}h left`;
  };

  const getProfile = (post: any): Profile => {
    const p = post?.profiles;
    if (!p) return { id: "", username: "anon", display_name: "Anonymous", avatar_url: null };
    const prof = Array.isArray(p) ? p[0] : p;
    return prof || { id: "", username: "anon", display_name: "Anonymous", avatar_url: null };
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-28">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            <Trophy size={20} className="text-purple-400" />
            <h1 className="text-lg font-bold font-display">Fit Challenges</h1>
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-text-t" />
        </div>
        <BottomNav />
      </main>
    );
  }

  // ENTRY DETAIL VIEW
  if (selectedChallenge) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-28">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedChallenge(null)}
              className="text-text-s hover:text-text-p transition-colors"
            >
              ← Back
            </button>
            <h1 className="text-lg font-bold font-display truncate">
              {selectedChallenge.title}
            </h1>
          </div>
        </header>

        <div className="max-w-2xl mx-auto px-4 py-6">
          {/* CHALLENGE INFO */}
          <div className="rounded-2xl border border-border-s bg-bg-raised p-5 mb-6">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-bg-sunken flex items-center justify-center">
                <Shirt size={20} className="text-purple-400" />
              </div>
              <h2 className="text-lg font-bold font-display">{selectedChallenge.title}</h2>
            </div>
            {selectedChallenge.description && (
              <p className="text-sm text-text-s mb-3">{selectedChallenge.description}</p>
            )}
            <div className="flex items-center gap-4 text-xs text-text-t">
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span>{getTimeLeft(selectedChallenge.ends_at)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users size={12} />
                <span>{selectedChallenge.entries?.length || selectedChallenge.entry_count} entries</span>
              </div>
            </div>
          </div>

          {/* ENTRIES */}
          {selectedChallenge.entries && selectedChallenge.entries.length > 0 ? (
            <div className="space-y-4">
              {selectedChallenge.entries.map((entry, index) => {
                const profile = getProfile(entry.post);
                const totalVotes = entry.drip_count + entry.skip_count;
                return (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-border-s bg-bg-raised overflow-hidden"
                  >
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        {index < 3 && (
                          <span className={`text-sm font-bold ${
                            index === 0 ? "text-amber-400" : index === 1 ? "text-zinc-300" : "text-amber-600"
                          }`}>
                            #{index + 1}
                          </span>
                        )}
                        <img
                          src={profile.avatar_url || "/default-avatar.png"}
                          alt=""
                          className="w-7 h-7 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{profile.display_name}</p>
                          <p className="text-[10px] text-text-t">@{profile.username}</p>
                        </div>
                      </div>
                      {entry.post?.image_url && (
                        <img src={entry.post.image_url} alt="" className="w-full rounded-xl mb-2" />
                      )}
                      {entry.post?.video_url && (
                        <div className="rounded-xl overflow-hidden mb-2">
                          <VideoPlayer src={entry.post.video_url} className="w-full" />
                        </div>
                      )}
                      {entry.post?.text && (
                        <p className="text-xs text-text-s mb-2">{entry.post.text}</p>
                      )}
                    </div>
                    {/* VOTE BUTTONS */}
                    <div className="flex border-t border-border-s/50">
                      <button
                        type="button"
                        onClick={() => handleVoteEntry(entry.id, "drip")}
                        disabled={entryLoading === entry.id}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-cyan-400 hover:bg-cyan-400/10 transition-colors"
                      >
                        <Flame size={14} />
                        <span>Drip {entry.drip_count > 0 ? entry.drip_count : ""}</span>
                      </button>
                      <div className="w-px bg-border-s/50" />
                      <button
                        type="button"
                        onClick={() => handleVoteEntry(entry.id, "skip")}
                        disabled={entryLoading === entry.id}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-400/10 transition-colors"
                      >
                        <span>Skip {entry.skip_count > 0 ? entry.skip_count : ""}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
              <Sparkles size={32} className="mx-auto text-text-m mb-4" />
              <h3 className="font-semibold font-display">No entries yet</h3>
              <p className="text-sm text-text-t mt-2">
                Be the first to submit a fit to this challenge!
              </p>
              <Link
                href="/feed"
                className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-btn text-btn-text text-sm font-bold active:scale-95 transition-all"
              >
                Create a post
              </Link>
            </div>
          )}
        </div>

        <BottomNav />
      </main>
    );
  }

  // CHALLENGE LIST VIEW
  return (
    <main className="min-h-screen bg-bg text-text-p pb-28">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Trophy size={20} className="text-purple-400" />
          <h1 className="text-lg font-bold font-display">Fit Challenges</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* HERO */}
        <section className="mb-6 rounded-2xl bg-gradient-to-br from-purple-950/40 to-cyan-950/30 border border-purple-900/30 p-5">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles size={20} className="text-purple-400" />
            <h2 className="text-lg font-bold font-display">Weekly Challenges</h2>
          </div>
          <p className="text-sm text-text-s">
            Join themed challenges, submit your best fits, and compete for the top spot.
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
              {tab === "active" ? "Active" : "Past"}
            </button>
          ))}
        </div>

        {/* CHALLENGES */}
        {challenges.length === 0 ? (
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <Trophy size={32} className="mx-auto text-text-m mb-4" />
            <h3 className="font-semibold font-display">No challenges yet</h3>
            <p className="text-sm text-text-t mt-2">
              Challenges will appear here when created by the community.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {challenges.map((challenge) => {                  const isActive = challenge.status === "active";

              return (
                <button
                  key={challenge.id}
                  type="button"
                  onClick={() => loadChallengeEntries(challenge)}
                  className="w-full text-left rounded-2xl border border-border-s bg-bg-raised p-4 hover:bg-bg-sunken/30 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-bg-sunken flex items-center justify-center shrink-0">
                      <Sparkles size={20} className="text-purple-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-sm font-display truncate">
                          {challenge.title}
                        </h3>
                        {isActive && (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-900/40 text-[10px] font-bold text-emerald-400">
                            LIVE
                          </span>
                        )}
                      </div>
                      {challenge.description && (
                        <p className="text-xs text-text-t mt-0.5 line-clamp-2">
                          {challenge.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-text-m">
                        <div className="flex items-center gap-1">
                          <Clock size={12} />
                          <span>{getTimeLeft(challenge.ends_at)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users size={12} />
                          <span>{challenge.entry_count} entries</span>
                        </div>
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-text-m shrink-0 mt-1" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {useMock && (
          <div className="mt-6 rounded-xl border border-purple-900/30 bg-purple-950/20 p-4 text-center">
            <p className="text-xs text-purple-400/80">
              Challenges database tables not set up yet. Running in demo mode.
            </p>
            <p className="text-[10px] text-text-m mt-1">
              Run the SQL migration in supabase/migrations/create_competitions_tables.sql to enable real challenges.
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

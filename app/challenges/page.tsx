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
  ArrowLeft,
  ArrowBigUp,
  ArrowBigDown,
  TrendingUp,
  Lightbulb,
  Send,
  X,
  Settings,
  Trash2,
  Pause,
  Play,
  Hash,
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
  created_by: string | null;
  entry_count: number;
  entries: ChallengeEntry[];
};

type TrendingTheme = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: string;
  created_at: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  upvotes: number;
  downvotes: number;
  score: number;
  user_vote?: "up" | "down" | null;
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
    created_by: null,
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
    created_by: null,
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
    created_by: null,
    entry_count: 89,
    entries: [],
  },
];

export default function ChallengesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [selectedChallenge, setSelectedChallenge] = useState<Challenge | null>(null);
  const [activeTab, setActiveTab] = useState<"active" | "completed">("active");
  const [useMock, setUseMock] = useState(false);
  const [entryLoading, setEntryLoading] = useState<string | null>(null);

  // ==========================================
  // TRENDING THEMES STATE
  // ==========================================

  const [trendingThemes, setTrendingThemes] = useState<TrendingTheme[]>([]);
  const [themesLoading, setThemesLoading] = useState(true);
  const [showThemeForm, setShowThemeForm] = useState(false);
  const [newThemeTitle, setNewThemeTitle] = useState("");
  const [newThemeDesc, setNewThemeDesc] = useState("");
  const [submittingTheme, setSubmittingTheme] = useState(false);
  const [votingThemeId, setVotingThemeId] = useState<string | null>(null);

  // ==========================================
  // ADMIN STATE
  // ==========================================

  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // ==========================================
  // CREATE CHALLENGE STATE
  // ==========================================

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newChallengeTitle, setNewChallengeTitle] = useState("");
  const [newChallengeDesc, setNewChallengeDesc] = useState("");
  const [newChallengeDuration, setNewChallengeDuration] = useState(7);
  const [creatingChallenge, setCreatingChallenge] = useState(false);

  // ==========================================
  // AUTH
  // ==========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (currentUser) => {
      if (!currentUser) {
        router.replace("/login");
        return;
      }
      setUser(currentUser);
      const profile = await syncProfile(currentUser);
      const id = profile?.id;
      if (id && id.includes('-')) {
        setProfileId(id);
      } else {
        console.error('Invalid profile ID:', id);
      }
    });
    return () => unsubscribe();
  }, [router]);

  // ==========================================
  // LOAD CHALLENGES
  // ==========================================

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

  // ==========================================
  // LOAD TRENDING THEMES
  // ==========================================

  const loadTrendingThemes = useCallback(async () => {
    try {
      setThemesLoading(true);

      // Try loading from the view first
      const { data: themesData, error } = await supabase
        .from("challenge_themes")
        .select(`
          *,
          profiles:user_id (username, display_name, avatar_url)
        `)
        .in("status", ["pending", "approved"])
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Themes table not found:", error);
        setTrendingThemes([]);
        return;
      }

      // Get vote counts for each theme
      const themes: TrendingTheme[] = await Promise.all(
        (themesData || []).map(async (theme: any) => {
          const { data: votes } = await supabase
            .from("theme_votes")
            .select("vote, user_id")
            .eq("theme_id", theme.id);

          const upvotes = votes?.filter((v) => v.vote === "up").length || 0;
          const downvotes = votes?.filter((v) => v.vote === "down").length || 0;
          const userVote = votes?.find((v) => v.user_id === profileId)?.vote as "up" | "down" | undefined;

          const profile = theme.profiles;
          const p = Array.isArray(profile) ? profile[0] : profile;

          return {
            ...theme,
            username: p?.username || "anon",
            display_name: p?.display_name || "Anonymous",
            avatar_url: p?.avatar_url || null,
            upvotes,
            downvotes,
            score: upvotes - downvotes,
            user_vote: userVote || null,
          };
        })
      );

      // Sort by score descending
      themes.sort((a, b) => b.score - a.score);
      setTrendingThemes(themes);
    } catch (err) {
      console.error("Failed to load trending themes:", err);
      setTrendingThemes([]);
    } finally {
      setThemesLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (user) {
      loadTrendingThemes();
    }
  }, [user, loadTrendingThemes]);

  // ==========================================
  // SUBMIT NEW THEME
  // ==========================================

  const handleSubmitTheme = async () => {
    if (!newThemeTitle.trim() || !user || !profileId || submittingTheme) return;

    setSubmittingTheme(true);
    try {
      const { error } = await supabase.from("challenge_themes").insert({
        user_id: profileId,
        title: newThemeTitle.trim(),
        description: newThemeDesc.trim() || null,
        status: "pending",
      });

      if (error) {
        if (error.code === "23505") {
          alert("That theme already exists!");
        } else {
          throw error;
        }
        return;
      }

      setNewThemeTitle("");
      setNewThemeDesc("");
      setShowThemeForm(false);
      loadTrendingThemes();
    } catch (err) {
      console.error("Failed to submit theme:", err);
      alert("Could not submit theme. Please try again.");
    } finally {
      setSubmittingTheme(false);
    }
  };

  // ==========================================
  // VOTE ON THEME
  // ==========================================

  const handleVoteTheme = async (themeId: string, vote: "up" | "down") => {
    if (!user || !profileId || votingThemeId) return;

    setVotingThemeId(themeId);
    try {
      // Check for existing vote
      const existing = trendingThemes.find((t) => t.id === themeId);
      const currentVote = existing?.user_vote;

      if (currentVote === vote) {
        // Remove vote (toggle off)
        const { error } = await supabase
          .from("theme_votes")
          .delete()
          .eq("theme_id", themeId)
          .eq("user_id", profileId);

        if (error) throw error;
      } else if (currentVote) {
        // Change vote
        const { error } = await supabase
          .from("theme_votes")
          .update({ vote })
          .eq("theme_id", themeId)
          .eq("user_id", profileId);

        if (error) throw error;
      } else {
        // New vote
        const { error } = await supabase.from("theme_votes").insert({
          theme_id: themeId,
          user_id: profileId,
          vote,
        });

        if (error) throw error;
      }

      // Notify theme owner on new or changed votes (fire-and-forget)
      if (existing && existing.user_id !== profileId) {
        const { sendNotification } = await import("@/lib/notifications");
        sendNotification({
          recipientId: existing.user_id,
          type: "theme_vote",
          themeId,
          text: vote,
        });
      }

      loadTrendingThemes();
    } catch (err) {
      console.error("Vote failed:", err);
    } finally {
      setVotingThemeId(null);
    }
  };

  // ==========================================
  // LOAD CHALLENGE ENTRIES
  // ==========================================

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

      enriched.sort((a, b) => b.drip_count - a.drip_count);

      setSelectedChallenge((prev) =>
        prev ? { ...prev, entries: enriched } : null
      );
    } catch (err) {
      console.error("Failed to load entries:", err);
    }
  };

  // ==========================================
  // VOTE ON ENTRY
  // ==========================================

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

  // ==========================================
  // HELPERS
  // ==========================================

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

  // ==========================================
  // ADMIN FUNCTIONS
  // ==========================================

  const isCreator = selectedChallenge?.created_by === user?.uid;

  const handleUpdateChallenge = async () => {
    if (!selectedChallenge || !isCreator || adminLoading) return;

    setAdminLoading(true);
    try {
      const { error } = await supabase
        .from("challenges")
        .update({
          title: editTitle.trim() || selectedChallenge.title,
          description: editDescription.trim() || null,
        })
        .eq("id", selectedChallenge.id);

      if (error) throw error;

      setSelectedChallenge((prev) =>
        prev
          ? {
              ...prev,
              title: editTitle.trim() || prev.title,
              description: editDescription.trim() || null,
            }
          : null
      );

      setShowAdminPanel(false);
    } catch (err) {
      console.error("Failed to update challenge:", err);
      alert("Could not update challenge.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleToggleChallengeStatus = async () => {
    if (!selectedChallenge || !isCreator || adminLoading) return;

    const newStatus = selectedChallenge.status === "active" ? "completed" : "active";
    setAdminLoading(true);

    try {
      const { error } = await supabase
        .from("challenges")
        .update({ status: newStatus })
        .eq("id", selectedChallenge.id);

      if (error) throw error;

      setSelectedChallenge((prev) =>
        prev ? { ...prev, status: newStatus } : null
      );
    } catch (err) {
      console.error("Failed to toggle status:", err);
      alert("Could not update status.");
    } finally {
      setAdminLoading(false);
    }
  };

  const handleDeleteChallenge = async () => {
    if (!selectedChallenge || !isCreator || adminLoading) return;
    if (!confirm("Are you sure you want to delete this challenge?")) return;

    setAdminLoading(true);
    try {
      const { error } = await supabase
        .from("challenges")
        .delete()
        .eq("id", selectedChallenge.id);

      if (error) throw error;

      setSelectedChallenge(null);
      loadChallenges();
    } catch (err) {
      console.error("Failed to delete challenge:", err);
      alert("Could not delete challenge.");
    } finally {
      setAdminLoading(false);
    }
  };

  // ==========================================
  // CREATE CHALLENGE
  // ==========================================

  const handleCreateChallenge = async () => {
    if (!newChallengeTitle.trim() || !user || creatingChallenge) return;

    setCreatingChallenge(true);
    try {
      const now = new Date();
      const endsAt = new Date(now.getTime() + newChallengeDuration * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from("challenges")
        .insert({
          title: newChallengeTitle.trim(),
          description: newChallengeDesc.trim() || null,
          theme: "custom",
          status: "active",
          starts_at: now.toISOString(),
          ends_at: endsAt.toISOString(),
          created_by: user.uid,
        })
        .select("id")
        .single();

      if (error) throw error;

      // Reset form
      setNewChallengeTitle("");
      setNewChallengeDesc("");
      setNewChallengeDuration(7);
      setShowCreateForm(false);

      // Reload challenges
      loadChallenges();
    } catch (err) {
      console.error("Failed to create challenge:", err);
      alert("Could not create challenge. Please try again.");
    } finally {
      setCreatingChallenge(false);
    }
  };

  // ==========================================
  // LOADING STATE
  // ==========================================

  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-28">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            <Link href="/explore" className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors">
              <ArrowLeft size={19} />
            </Link>
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

  // ==========================================
  // ENTRY DETAIL VIEW
  // ==========================================

  if (selectedChallenge) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-28">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedChallenge(null)}
              className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors"
            >
              <ArrowLeft size={19} />
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
            <div className="flex items-center gap-4 text-xs text-text-t mb-3">
              <div className="flex items-center gap-1">
                <Clock size={12} />
                <span>{getTimeLeft(selectedChallenge.ends_at)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Users size={12} />
                <span>{selectedChallenge.entries?.length || selectedChallenge.entry_count} entries</span>
              </div>
              <div className="flex items-center gap-1">
                <Hash size={12} className="text-purple-400" />
                <span className="text-purple-400 font-medium">{selectedChallenge.theme}</span>
              </div>
            </div>

            {/* HASHTAG STATS */}
            <ChallengeHashtagStats theme={selectedChallenge.theme} />
          </div>

          {/* ADMIN PANEL (only for creators) */}
          {isCreator && (
            <div className="mb-6">
              <button
                type="button"
                onClick={() => {
                  setShowAdminPanel(!showAdminPanel);
                  setEditTitle(selectedChallenge.title);
                  setEditDescription(selectedChallenge.description || "");
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-purple-500/30 bg-purple-950/30 text-sm font-semibold text-purple-400 hover:bg-purple-950/50 transition-colors mb-3"
              >
                <Settings size={16} />
                <span>Admin Controls</span>
              </button>

              {showAdminPanel && (
                <div className="rounded-2xl border border-purple-500/20 bg-bg-raised p-4">
                  <h3 className="text-sm font-semibold mb-3">Edit Challenge</h3>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Title"
                    className="w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p placeholder:text-text-m outline-none focus:border-purple-500/50 transition-colors mb-2"
                  />
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    placeholder="Description"
                    rows={2}
                    className="w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p placeholder:text-text-m outline-none focus:border-purple-500/50 transition-colors resize-none mb-3"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleUpdateChallenge}
                      disabled={adminLoading}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-btn text-btn-text text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                    >
                      {adminLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                      <span>Save Changes</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleChallengeStatus}
                      disabled={adminLoading}
                      className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40 ${
                        selectedChallenge.status === "active"
                          ? "bg-amber-950/50 border border-amber-700/30 text-amber-400"
                          : "bg-emerald-950/50 border border-emerald-700/30 text-emerald-400"
                      }`}
                    >
                      {selectedChallenge.status === "active" ? <Pause size={14} /> : <Play size={14} />}
                      <span>{selectedChallenge.status === "active" ? "End" : "Reactivate"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDeleteChallenge}
                      disabled={adminLoading}
                      className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-red-950/50 border border-red-700/30 text-red-400 text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ENTRIES */}
          {selectedChallenge.entries && selectedChallenge.entries.length > 0 ? (
            <div className="space-y-4">
              {selectedChallenge.entries.map((entry, index) => {
                const profile = getProfile(entry.post);
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
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        <Flame size={14} />
                        <span>Drip {entry.drip_count > 0 ? entry.drip_count : ""}</span>
                      </button>
                      <div className="w-px bg-border-s/50" />
                      <button
                        type="button"
                        onClick={() => handleVoteEntry(entry.id, "skip")}
                        disabled={entryLoading === entry.id}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors"
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
                href="/create-post"
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

  // ==========================================
  // CHALLENGE LIST VIEW
  // ==========================================

  return (
    <main className="min-h-screen bg-bg text-text-p pb-28">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link href="/explore" className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors">
            <ArrowLeft size={19} />
          </Link>
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

        {/* ==========================================
            TRENDING THEMES SECTION
            ========================================== */}

        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp size={18} className="text-cyan-400" />
              <h2 className="text-base font-bold font-display">Trending Themes</h2>
            </div>
            <button
              type="button"
              onClick={() => setShowThemeForm(!showThemeForm)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-btn text-btn-text transition-all active:scale-95"
            >
              {showThemeForm ? <X size={14} /> : <Lightbulb size={14} />}
              <span>{showThemeForm ? "Cancel" : "Suggest"}</span>
            </button>
          </div>

          {/* SUGGEST THEME FORM */}
          {showThemeForm && (
            <div className="rounded-2xl border border-border-s bg-bg-raised p-4 mb-4">
              <p className="text-xs text-text-t mb-3">
                Suggest a theme for the next challenge. Top-voted themes get featured!
              </p>
              <input
                type="text"
                value={newThemeTitle}
                onChange={(e) => setNewThemeTitle(e.target.value.slice(0, 60))}
                placeholder="Theme title (e.g. Neon Nights)"
                maxLength={60}
                className="w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p placeholder:text-text-m outline-none focus:border-purple-500/50 transition-colors mb-2"
              />
              <textarea
                value={newThemeDesc}
                onChange={(e) => setNewThemeDesc(e.target.value.slice(0, 200))}
                placeholder="Description (optional)"
                rows={2}
                maxLength={200}
                className="w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p placeholder:text-text-m outline-none focus:border-purple-500/50 transition-colors resize-none mb-3"
              />
              <button
                type="button"
                onClick={handleSubmitTheme}
                disabled={!newThemeTitle.trim() || submittingTheme}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-btn text-btn-text text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submittingTheme ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span>{submittingTheme ? "Submitting..." : "Submit Theme"}</span>
              </button>
            </div>
          )}

          {/* THEMES LIST */}
          {themesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-text-t" />
            </div>
          ) : trendingThemes.length === 0 ? (
            <div className="rounded-2xl border border-border-s bg-bg-raised p-6 text-center">
              <Lightbulb size={24} className="mx-auto text-text-m mb-3" />
              <p className="text-sm text-text-t">
                No themes yet. Be the first to suggest one!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {trendingThemes.map((theme) => (
                <div
                  key={theme.id}
                  className="flex items-center gap-3 rounded-2xl border border-border-s bg-bg-raised p-3"
                >
                  {/* VOTE BUTTONS */}
                  <div className="flex flex-col items-center gap-0.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleVoteTheme(theme.id, "up")}
                      disabled={votingThemeId === theme.id}
                      className={`p-1 rounded-lg transition-all ${
                        theme.user_vote === "up"
                          ? "text-cyan-400 bg-cyan-400/10"
                          : "text-text-m hover:text-cyan-400 hover:bg-cyan-400/10"
                      }`}
                    >
                      <ArrowBigUp size={20} strokeWidth={theme.user_vote === "up" ? 2.5 : 1.5} />
                    </button>
                    <span className={`text-xs font-bold tabular-nums ${
                      theme.score > 0 ? "text-cyan-400" : theme.score < 0 ? "text-rose-400" : "text-text-m"
                    }`}>
                      {theme.score}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleVoteTheme(theme.id, "down")}
                      disabled={votingThemeId === theme.id}
                      className={`p-1 rounded-lg transition-all ${
                        theme.user_vote === "down"
                          ? "text-rose-400 bg-rose-400/10"
                          : "text-text-m hover:text-rose-400 hover:bg-rose-400/10"
                      }`}
                    >
                      <ArrowBigDown size={20} strokeWidth={theme.user_vote === "down" ? 2.5 : 1.5} />
                    </button>
                  </div>

                  {/* THEME INFO */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold font-display truncate">{theme.title}</p>
                    {theme.description && (
                      <p className="text-xs text-text-t mt-0.5 line-clamp-1">{theme.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                      <img
                        src={theme.avatar_url || "/default-avatar.png"}
                        alt=""
                        className="w-4 h-4 rounded-full object-cover"
                      />
                      <span className="text-[10px] text-text-m">@{theme.username}</span>
                      <span className="text-[10px] text-text-m">·</span>
                      <span className="text-[10px] text-text-m">
                        {theme.upvotes + theme.downvotes} vote{(theme.upvotes + theme.downvotes) !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>

                  {/* STATUS BADGE */}
                  {theme.status === "approved" && (
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-900/40 text-[10px] font-bold text-emerald-400">
                      APPROVED
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ==========================================
            CREATE CHALLENGE
            ========================================== */}

        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors w-full justify-center"
          >
            {showCreateForm ? <X size={16} /> : <Plus size={16} />}
            <span>{showCreateForm ? "Cancel" : "Create a Challenge"}</span>
          </button>

          {showCreateForm && (
            <div className="mt-3 rounded-2xl border border-purple-500/20 bg-bg-raised p-4">
              <h3 className="text-sm font-semibold mb-3">New Challenge</h3>
              <input
                type="text"
                value={newChallengeTitle}
                onChange={(e) => setNewChallengeTitle(e.target.value.slice(0, 80))}
                placeholder="Challenge title (e.g. Neon Nights)"
                maxLength={80}
                className="w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p placeholder:text-text-m outline-none focus:border-purple-500/50 transition-colors mb-2"
              />
              <textarea
                value={newChallengeDesc}
                onChange={(e) => setNewChallengeDesc(e.target.value.slice(0, 300))}
                placeholder="Description — what should people wear?"
                rows={2}
                maxLength={300}
                className="w-full px-3 py-2.5 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p placeholder:text-text-m outline-none focus:border-purple-500/50 transition-colors resize-none mb-3"
              />
              <div className="mb-3">
                <p className="text-xs text-text-t mb-2">Duration</p>
                <select
                  value={newChallengeDuration}
                  onChange={(e) => setNewChallengeDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl bg-bg-sunken border border-border-s text-sm text-text-p outline-none focus:border-purple-500/50 transition-colors appearance-none cursor-pointer"
                >
                  {[...Array(14)].map((_, i) => {
                    const days = i + 1;
                    return (
                      <option key={days} value={days}>
                        {days} {days === 1 ? "day" : "days"}
                        {days === 14 ? " (2 weeks)" : ""}
                      </option>
                    );
                  })}
                </select>
              </div>
              <button
                type="button"
                onClick={handleCreateChallenge}
                disabled={!newChallengeTitle.trim() || creatingChallenge}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 text-white text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {creatingChallenge ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={14} />
                )}
                <span>{creatingChallenge ? "Creating..." : "Create Challenge"}</span>
              </button>
            </div>
          )}
        </div>

        {/* ==========================================
            CHALLENGES SECTION
            ========================================== */}

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
              Vote on trending themes above to help pick the next challenge!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {challenges.map((challenge) => {
              const isActive = challenge.status === "active";

              const isMyChallenge = challenge.created_by === user?.uid;

              return (
                <div
                  key={challenge.id}
                  className={`relative rounded-2xl border bg-bg-raised overflow-hidden transition-all ${
                    isMyChallenge ? "border-purple-500/30" : "border-border-s"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => loadChallengeEntries(challenge)}
                    className="w-full text-left p-4 hover:bg-bg-sunken/30 transition-all active:scale-[0.99]"
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
                          {isMyChallenge && (
                            <span className="shrink-0 px-2 py-0.5 rounded-full bg-purple-950/60 border border-purple-900/40 text-[10px] font-bold text-purple-400">
                              YOURS
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
                            <Hash size={12} className="text-purple-400" />
                            <span className="text-purple-400 font-medium">{challenge.theme}</span>
                          </div>
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

                  {/* ADMIN LINK (only for creator's challenges) */}
                  {isMyChallenge && (
                    <div className="px-4 pb-3 pt-0 flex gap-2">
                      <Link
                        href={`/leaderboard/${challenge.theme}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-950/50 border border-purple-900/30 text-[11px] font-semibold text-purple-400 hover:bg-purple-950/70 transition-colors"
                      >
                        <Trophy size={12} />
                        <span>Leaderboard</span>
                      </Link>
                      <Link
                        href={`/hashtag/${challenge.theme}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-sunken text-[11px] font-semibold text-text-t hover:text-text-p transition-colors"
                      >
                        <Hash size={12} />
                        <span>View posts</span>
                      </Link>
                    </div>
                  )}
                </div>
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
              Run the SQL migrations in supabase/migrations/ to enable real challenges and themes.
            </p>
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

// ==========================================
// HASHTAG STATS COMPONENT
// ==========================================

function ChallengeHashtagStats({ theme }: { theme: string }) {
  const [postCount, setPostCount] = useState(0);
  const [totalDrips, setTotalDrips] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        // Find hashtag
        const { data: hashtag } = await supabase
          .from("hashtags")
          .select("id")
          .eq("name", theme)
          .single();

        if (!hashtag) {
          setLoading(false);
          return;
        }

        // Get posts with this hashtag
        const { data: postHashtags } = await supabase
          .from("post_hashtags")
          .select("post_id")
          .eq("hashtag_id", hashtag.id);

        const postIds = postHashtags?.map((ph) => ph.post_id) || [];
        setPostCount(postIds.length);

        if (postIds.length === 0) {
          setLoading(false);
          return;
        }

        // Get drips for these posts
        const { data: votes } = await supabase
          .from("votes")
          .select("vote")
          .in("fit_id", postIds)
          .eq("vote", "drip");

        setTotalDrips(votes?.length || 0);
      } catch {
        // Stats not available
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [theme]);

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-xs text-text-m">
        <div className="h-3 w-16 rounded bg-bg-sunken animate-pulse" />
        <div className="h-3 w-16 rounded bg-bg-sunken animate-pulse" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="flex items-center gap-1.5">
        <Hash size={12} className="text-cyan-400" />
        <span className="text-text-t">Posts:</span>
        <span className="font-bold text-text-p">{postCount}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Flame size={12} className="text-cyan-400" />
        <span className="text-text-t">Drips:</span>
        <span className="font-bold text-cyan-400">{totalDrips}</span>
      </div>
    </div>
  );
}

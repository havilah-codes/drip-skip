"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Trophy,
  Crown,
  Medal,
  Award,
  Flame,
  Search,
  Loader2,
  ArrowLeft,
  ExternalLink,
  Users,
  Calendar,
  Info,
  X,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

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
};

type EventInfo = {
  hashtag: string;
  total_posts: number;
  total_participants: number;
  starts_at: string | null;
  ends_at: string | null;
};

export default function PublicLeaderboardPage() {
  const params = useParams();
  const slug = (params.slug as string)?.toLowerCase();

  const [loading, setLoading] = useState(true);
  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<LeaderboardEntry[]>([]);
  const [error, setError] = useState("");
  const [showEventInfo, setShowEventInfo] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const loadLeaderboard = async () => {
      setLoading(true);
      setError("");

      try {
        // Find hashtag
        const { data: hashtag, error: hashtagError } = await supabase
          .from("hashtags")
          .select("id, name")
          .eq("name", slug)
          .single();

        if (hashtagError || !hashtag) {
          setError(`No event found for #${slug}`);
          setLoading(false);
          return;
        }

        // Get all posts with this hashtag
        const { data: postHashtags } = await supabase
          .from("post_hashtags")
          .select("post_id")
          .eq("hashtag_id", hashtag.id);

        const postIds = postHashtags?.map((ph) => ph.post_id) || [];

        if (postIds.length === 0) {
          setEventInfo({
            hashtag: slug,
            total_posts: 0,
            total_participants: 0,
            starts_at: null,
            ends_at: null,
          });
          setEntries([]);
          setLoading(false);
          return;
        }

        // Get posts with user info
        const { data: posts } = await supabase
          .from("posts")
          .select("id, user_id, created_at")
          .in("id", postIds);

        if (!posts || posts.length === 0) {
          setEventInfo({
            hashtag: slug,
            total_posts: 0,
            total_participants: 0,
            starts_at: null,
            ends_at: null,
          });
          setEntries([]);
          setLoading(false);
          return;
        }

        // Get votes for these posts
        const { data: votes } = await supabase
          .from("votes")
          .select("fit_id, vote")
          .in("fit_id", postIds);

        // Aggregate stats by user
        const userStats = new Map<
          string,
          { drip: number; skip: number; posts: Set<string> }
        >();

        for (const post of posts) {
          const stats = userStats.get(post.user_id) || {
            drip: 0,
            skip: 0,
            posts: new Set(),
          };
          stats.posts.add(post.id);
          userStats.set(post.user_id, stats);
        }

        for (const vote of votes || []) {
          const post = posts.find((p) => p.id === vote.fit_id);
          if (!post) continue;
          const stats = userStats.get(post.user_id);
          if (!stats) continue;
          if (vote.vote === "drip") stats.drip++;
          if (vote.vote === "skip") stats.skip++;
        }

        // Get profiles for all participants
        const userIds = Array.from(userStats.keys());
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username, display_name, avatar_url")
          .in("id", userIds);

        const profileMap = new Map(profiles?.map((p) => [p.id, p]) || []);

        // Build leaderboard entries
        const allEntries: LeaderboardEntry[] = userIds.map((uid) => {
          const stats = userStats.get(uid)!;
          const total = stats.drip + stats.skip;
          const profile = profileMap.get(uid);
          return {
            rank: 0,
            user_id: uid,
            username: profile?.username || "unknown",
            display_name: profile?.display_name || "Unknown",
            avatar_url: profile?.avatar_url || null,
            drip_count: stats.drip,
            skip_count: stats.skip,
            post_count: stats.posts.size,
            drip_ratio: total > 0 ? stats.drip / total : 0,
          };
        });

        // Filter to only entries with at least 5 drips
        const qualifiedEntries = allEntries.filter((e) => e.drip_count >= 5);

        // Sort by drip count, then ratio, then post count
        qualifiedEntries.sort(
          (a, b) =>
            b.drip_count - a.drip_count ||
            b.drip_ratio - a.drip_ratio ||
            b.post_count - a.post_count
        );

        // Assign ranks
        qualifiedEntries.forEach((entry, i) => (entry.rank = i + 1));

        // Event date range
        const dates = posts.map((p) => new Date(p.created_at).getTime());
        const startsAt = new Date(Math.min(...dates)).toISOString();
        const endsAt = new Date(Math.max(...dates)).toISOString();

        setEventInfo({
          hashtag: slug,
          total_posts: postIds.length,
          total_participants: userIds.length,
          starts_at: startsAt,
          ends_at: endsAt,
        });

        setEntries(qualifiedEntries);
      } catch (err) {
        console.error("Failed to load leaderboard:", err);
        setError("Failed to load leaderboard. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadLeaderboard();
  }, [slug]);

  // Filter entries based on search
  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.toLowerCase().trim();
    return entries.filter(
      (e) =>
        e.username.toLowerCase().includes(q) ||
        e.display_name.toLowerCase().includes(q)
    );
  }, [entries, searchQuery]);

  // Top 10 and Bottom 10
  const top10 = entries.slice(0, 10);
  const bottom10 = entries.length > 10 ? entries.slice(-10).reverse() : [];
  const hasSearch = searchQuery.trim().length > 0;

  const formatDate = (iso: string) => {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown size={18} className="text-amber-400" />;
    if (rank === 2) return <Medal size={18} className="text-zinc-300" />;
    if (rank === 3) return <Award size={18} className="text-amber-600" />;
    return (
      <div className="w-6 h-6 rounded-full bg-bg-sunken flex items-center justify-center">
        <span className="text-xs font-bold text-text-m">{rank}</span>
      </div>
    );
  };

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <Link
              href="/explore"
              className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors"
            >
              <ArrowLeft size={19} />
            </Link>
            <Trophy size={20} className="text-amber-400" />
            <h1 className="text-lg font-bold font-display">Leaderboard</h1>
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-text-t" />
        </div>
      </main>
    );
  }

  // ==========================================
  // ERROR
  // ==========================================

  if (error) {
    return (
      <main className="min-h-screen bg-bg text-text-p">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
            <Link
              href="/explore"
              className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors"
            >
              <ArrowLeft size={19} />
            </Link>
            <Trophy size={20} className="text-amber-400" />
            <h1 className="text-lg font-bold font-display">Leaderboard</h1>
          </div>
        </header>
        <div className="max-w-2xl mx-auto px-4 py-10">
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <Trophy size={32} className="mx-auto text-text-m mb-4" />
            <h3 className="font-semibold font-display">{error}</h3>
            <p className="text-sm text-text-t mt-2">
              This leaderboard may not exist yet.
            </p>
            <Link
              href="/explore"
              className="inline-flex mt-4 px-5 py-2.5 rounded-xl bg-btn text-btn-text text-sm font-bold active:scale-95 transition-all"
            >
              Back to Explore
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ==========================================
  // PAGE
  // ==========================================

  return (
    <main className="min-h-screen bg-bg text-text-p pb-10">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link
            href="/explore"
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors"
          >
            <ArrowLeft size={19} />
          </Link>
          <Trophy size={20} className="text-amber-400" />
          <div className="min-w-0">
            <h1 className="text-lg font-bold font-display truncate">
              #{eventInfo?.hashtag}
            </h1>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* EVENT INFO CARD */}
        <div className="rounded-2xl border border-amber-900/30 bg-gradient-to-br from-amber-950/30 to-yellow-950/20 p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-950/60 flex items-center justify-center shrink-0">
              <Trophy size={20} className="text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-bold font-display truncate">
                #{eventInfo?.hashtag} Leaderboard
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowEventInfo(!showEventInfo)}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-text-m hover:text-amber-400 hover:bg-amber-950/40 transition-colors shrink-0"
            >
              {showEventInfo ? <X size={18} /> : <Info size={18} />}
            </button>
          </div>
          {showEventInfo && (
            <div className="mt-3 pt-3 border-t border-amber-900/20 space-y-2">
              <div className="flex items-center gap-4 text-xs text-text-t">
                <div className="flex items-center gap-1.5">
                  <Users size={12} />
                  <span>{eventInfo?.total_participants} participants</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Flame size={12} className="text-cyan-400" />
                  <span>{eventInfo?.total_posts} posts</span>
                </div>
              </div>
              {eventInfo?.starts_at && (
                <div className="flex items-center gap-1.5 text-xs text-text-t">
                  <Calendar size={12} />
                  <span>
                    {formatDate(eventInfo.starts_at)}
                    {eventInfo.ends_at && ` – ${formatDate(eventInfo.ends_at)}`}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SEARCH BAR */}
        <div className="relative mb-6">
          <Search
            size={18}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-text-t"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your username..."
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
              focus:border-amber-500/50
              transition-colors
            "
          />
          {searchQuery.trim() && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-text-m hover:text-text-p text-lg"
            >
              ×
            </button>
          )}
        </div>

        {/* SEARCH RESULTS */}
        {hasSearch && (
          <div className="mb-6">
            <h2 className="text-xs font-semibold text-text-t uppercase tracking-wider mb-3 px-1">
              Search Results ({filteredEntries.length})
            </h2>
            {filteredEntries.length === 0 ? (
              <div className="rounded-2xl border border-border-s bg-bg-raised p-6 text-center">
                <Search size={24} className="mx-auto text-text-m mb-2" />
                <p className="text-sm text-text-t">
                  No users found matching &quot;{searchQuery}&quot;
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredEntries.map((entry) => (
                  <div
                    key={entry.user_id}
                    className="flex items-center gap-3 p-3 rounded-2xl border border-border-s bg-bg-raised"
                  >
                    <div className="w-8 flex items-center justify-center shrink-0">
                      {getRankIcon(entry.rank)}
                    </div>
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
                        </p>
                        <p className="text-xs text-text-t truncate">
                          @{entry.username}
                        </p>
                      </div>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right">
                        <div className="flex items-center gap-1">
                          <Flame size={12} className="text-cyan-400" />
                          <span className="text-sm font-bold text-cyan-400">
                            {entry.drip_count}
                          </span>
                        </div>
                        <p className="text-[10px] text-text-m text-right">
                          #{entry.rank}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TOP 10 */}
        {!hasSearch && top10.length > 0 && (
          <div className="mb-8">
            {/* PODIUM (Top 3) */}
            {top10.length >= 3 && (
              <div className="flex items-end justify-center gap-3 mb-6 px-4">
                {/* #2 — Silver */}
                <div className="w-[115px] text-center">
                  <img
                    src={top10[1].avatar_url || "/default-avatar.png"}
                    alt=""
                    className="w-16 h-16 rounded-full object-cover mx-auto border-[3px] border-zinc-200 mb-2"
                  />
                  <p className="text-xs font-semibold truncate">
                    {top10[1].display_name}
                  </p>
                  <p className="text-[10px] text-text-t mb-2">
                    @{top10[1].username}
                  </p>
                  <div className="rounded-t-xl bg-gradient-to-b from-zinc-300 to-zinc-400 pt-3 pb-2 px-2">
                    <Medal size={18} className="mx-auto text-white mb-1" />
                    <p className="text-lg font-black text-white">#2</p>
                    <p className="text-[11px] text-white font-bold flex items-center gap-1 justify-center">
                      <Flame size={10} /> {top10[1].drip_count}
                    </p>
                  </div>
                </div>

                {/* #1 — Gold */}
                <div className="w-[130px] text-center">
                  <img
                    src={top10[0].avatar_url || "/default-avatar.png"}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover mx-auto border-[4px] border-yellow-300 mb-2 shadow-lg shadow-yellow-400/30"
                  />
                  <p className="text-sm font-bold truncate">
                    {top10[0].display_name}
                  </p>
                  <p className="text-[10px] text-text-t mb-2">
                    @{top10[0].username}
                  </p>
                  <div className="rounded-t-xl bg-gradient-to-b from-yellow-400 to-yellow-600 pt-4 pb-2 px-2">
                    <Crown size={22} className="mx-auto text-white mb-1" />
                    <p className="text-xl font-black text-white">#1</p>
                    <p className="text-xs text-white font-bold flex items-center gap-1 justify-center">
                      <Flame size={12} /> {top10[0].drip_count}
                    </p>
                  </div>
                </div>

                {/* #3 — Bronze */}
                <div className="w-[115px] text-center">
                  <img
                    src={top10[2].avatar_url || "/default-avatar.png"}
                    alt=""
                    className="w-16 h-14 rounded-full object-cover mx-auto border-[3px] border-amber-700 mb-2"
                  />
                  <p className="text-xs font-semibold truncate">
                    {top10[2].display_name}
                  </p>
                  <p className="text-[10px] text-text-t mb-2">
                    @{top10[2].username}
                  </p>
                  <div className="rounded-t-xl bg-gradient-to-b from-amber-700 to-amber-900 pt-2 pb-2 px-2">
                    <Award size={16} className="mx-auto text-white mb-1" />
                    <p className="text-base font-black text-white">#3</p>
                    <p className="text-[10px] text-white font-bold flex items-center gap-1 justify-center">
                      <Flame size={9} /> {top10[2].drip_count}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* RANKS 4-10 */}
            <h2 className="text-xs font-semibold text-text-t uppercase tracking-wider mb-3 px-1">
              Top 10
            </h2>
            <div className="space-y-2">
              {top10.slice(3).map((entry) => (
                <div
                  key={entry.user_id}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-border-s bg-bg-raised"
                >
                  <div className="w-8 flex items-center justify-center shrink-0">
                    {getRankIcon(entry.rank)}
                  </div>
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
                      </p>
                      <p className="text-xs text-text-t truncate">
                        @{entry.username}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <Flame size={12} className="text-cyan-400" />
                        <span className="text-sm font-bold text-cyan-400">
                          {entry.drip_count}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-m">
                        {entry.post_count} posts
                      </p>
                    </div>
                    <div className="w-12">
                      <div className="h-1.5 rounded-full bg-bg-sunken/50 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-400"
                          style={{
                            width: `${entry.drip_ratio * 100}%`,
                          }}
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
          </div>
        )}

        {/* BOTTOM 10 */}
        {!hasSearch && bottom10.length > 0 && (
          <div className="mb-8">
            <h2 className="text-xs font-semibold text-text-t uppercase tracking-wider mb-3 px-1">
              Bottom 10
            </h2>
            <div className="space-y-2">
              {bottom10.map((entry) => (
                <div
                  key={entry.user_id}
                  className="flex items-center gap-3 p-3 rounded-2xl border border-border-s bg-bg-raised opacity-70"
                >
                  <div className="w-8 flex items-center justify-center shrink-0">
                    {getRankIcon(entry.rank)}
                  </div>
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
                      </p>
                      <p className="text-xs text-text-t truncate">
                        @{entry.username}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="flex items-center gap-1">
                        <Flame size={12} className="text-cyan-400" />
                        <span className="text-sm font-bold text-cyan-400">
                          {entry.drip_count}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-m">
                        {entry.post_count} posts
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EMPTY STATE */}
        {entries.length === 0 && (
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <Trophy size={32} className="mx-auto text-text-m mb-4" />
            <h3 className="font-semibold font-display">No rankings yet</h3>
            <p className="text-sm text-text-t mt-2">
              Posts with #{slug} will appear on this leaderboard.
            </p>
          </div>
        )}

        {/* SHARE LINK */}
        <div className="mt-6 text-center">
          <p className="text-xs text-text-t mb-2">
            Share this leaderboard
          </p>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(window.location.href);
              alert("Link copied!");
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-border-d bg-bg-raised hover:bg-bg-sunken text-sm text-text-s transition-colors"
          >
            <ExternalLink size={14} />
            <span>Copy Link</span>
          </button>
        </div>
      </div>
    </main>
  );
}

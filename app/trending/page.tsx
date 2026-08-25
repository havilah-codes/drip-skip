"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  Flame,
  Clock,
  Loader2,
  Crown,
  Medal,
  Award,
  ArrowLeft,
} from "lucide-react";
import { onAuthStateChanged, type User } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import BottomNav from "@/components/BottomNav";
import PostCard from "@/components/PostCard";

type TrendingPost = {
  id: string;
  user_id: string;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  profiles: any;
  drip_count: number;
  skip_count: number;
  total_votes: number;
  drip_ratio: number;
};

type TimeFilter = "day" | "week" | "month" | "all";

export default function TrendingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<TrendingPost[]>([]);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("week");

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

  const loadTrending = useCallback(async () => {
    try {
      const now = new Date();
      let since: Date;

      switch (timeFilter) {
        case "day":
          since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case "week":
          since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "month":
          since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        default:
          since = new Date(0);
      }

      // Fetch posts within time range
      const { data: postsData, error: postsError } = await supabase
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
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(100);

      if (postsError) throw postsError;
      if (!postsData || postsData.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      // Fetch votes for all posts
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

      // Enrich and sort by drip count
      const enriched: TrendingPost[] = postsData.map((post) => {
        const stats = voteMap[post.id] || { drip: 0, skip: 0 };
        const total = stats.drip + stats.skip;
        return {
          ...post,
          drip_count: stats.drip,
          skip_count: stats.skip,
          total_votes: total,
          drip_ratio: total > 0 ? stats.drip / total : 0,
        };
      });

      // Sort: primary by drip count, secondary by drip ratio, tertiary by recency
      enriched.sort((a, b) => {
        if (b.drip_count !== a.drip_count) return b.drip_count - a.drip_count;
        if (b.drip_ratio !== a.drip_ratio) return b.drip_ratio - a.drip_ratio;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setPosts(enriched.filter((p) => p.total_votes > 0));
    } catch (err) {
      console.error("Failed to load trending:", err);
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    if (user) {
      setLoading(true);
      loadTrending();
    }
  }, [user, loadTrending]);

  const getRankBadge = (index: number) => {
    if (index === 0) return <Crown size={16} className="text-amber-400" />;
    if (index === 1) return <Medal size={16} className="text-zinc-300" />;
    if (index === 2) return <Award size={16} className="text-amber-600" />;
    return <span className="text-xs font-bold text-text-m w-4 text-center">{index + 1}</span>;
  };

  const filters: { value: TimeFilter; label: string }[] = [
    { value: "day", label: "Today" },
    { value: "week", label: "This Week" },
    { value: "month", label: "This Month" },
    { value: "all", label: "All Time" },
  ];

  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p pb-28">
        <header className="sticky top-0 z-50 border-b border-border-s bg-bg/90 backdrop-blur">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
            <Link href="/explore" className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-colors">
              <ArrowLeft size={19} />
            </Link>
            <TrendingUp size={20} className="text-cyan-400" />
            <h1 className="text-lg font-bold font-display">Trending Fits</h1>
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
          <TrendingUp size={20} className="text-cyan-400" />
          <h1 className="text-lg font-bold font-display">Trending Fits</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* TIME FILTER */}
        <div className="flex items-center gap-1 mb-6 bg-bg-raised border border-border-s rounded-xl p-1 overflow-x-auto">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setTimeFilter(f.value); }}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                timeFilter === f.value
                  ? "bg-btn text-btn-text"
                  : "text-text-t hover:text-text-p"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* POSTS */}
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <TrendingUp size={32} className="mx-auto text-text-m mb-4" />
            <h3 className="font-semibold font-display">No trending fits yet</h3>
            <p className="text-sm text-text-t mt-2">
              {timeFilter === "day"
                ? "No posts received votes today. Come back later!"
                : "Keep voting to see what's trending."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.slice(0, 50).map((post, index) => (
              <div key={post.id} className="relative">
                {/* RANK BADGE */}
                {index < 3 && (
                  <div className="absolute -left-1 -top-1 z-10 w-8 h-8 rounded-full bg-bg-raised border border-border-d flex items-center justify-center shadow-lg">
                    {getRankBadge(index)}
                  </div>
                )}

                {/* RANK ROW (for positions 4+) */}
                {index >= 3 && (
                  <div className="flex items-center gap-2 mb-1 px-1">
                    {getRankBadge(index)}
                    <div className="h-px flex-1 bg-border-s/30" />
                  </div>
                )}

                {/* POST CARD */}
                <div className={`${index < 3 ? "ml-3" : ""}`}>
                  <PostCard post={post} />
                </div>

                {/* VOTE STATS BAR */}
                <div className="flex items-center gap-3 mt-1 px-2">
                  <div className="flex items-center gap-1">
                    <Flame size={12} className="text-cyan-400" />
                    <span className="text-[11px] font-bold text-cyan-400">
                      {post.drip_count}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-text-m">
                      {post.skip_count} skip{post.skip_count !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex-1 h-1 rounded-full bg-bg-sunken/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-cyan-400"
                      style={{ width: `${post.drip_ratio * 100}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-text-m font-medium">
                    {(post.drip_ratio * 100).toFixed(0)}% drip
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <BottomNav />
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Hash } from "lucide-react";
import { supabase } from "@/lib/supabase";
import PostCard, { type Post } from "@/components/PostCard";
import LoadingScreen from "@/components/LoadingScreen";

export default function HashtagPage() {
  const params = useParams();
  const router = useRouter();
  const tag = (params.tag as string)?.toLowerCase();

  const [posts, setPosts] = useState<Post[]>([]);
  const [postCount, setPostCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tag) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);

      // Find hashtag
      const { data: hashtag } = await supabase
        .from("hashtags")
        .select("id")
        .eq("name", tag)
        .single();

      if (!hashtag || cancelled) {
        if (!cancelled) {
          setPosts([]);
          setPostCount(0);
          setLoading(false);
        }
        return;
      }

      // Get post IDs for this hashtag
      const { data: postHashtags } = await supabase
        .from("post_hashtags")
        .select("post_id")
        .eq("hashtag_id", hashtag.id);

      const postIds = postHashtags?.map((ph) => ph.post_id) || [];
      setPostCount(postIds.length);

      if (postIds.length === 0) {
        if (!cancelled) {
          setPosts([]);
          setLoading(false);
        }
        return;
      }

      // Fetch posts
      const { data: postsData } = await supabase
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
        .in("id", postIds)
        .order("created_at", { ascending: false });

      if (!cancelled) {
        setPosts((postsData as Post[]) || []);
        setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [tag]);

  if (loading) {
    return <LoadingScreen message={`Loading #${tag}...`} />;
  }

  return (
    <main className="min-h-screen bg-black text-white pb-20">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-black/85 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-all"
            aria-label="Go back"
          >
            <ArrowLeft size={19} />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Hash size={18} className="text-cyan-400 shrink-0" />
              <h1 className="font-bold text-lg truncate font-display">{tag}</h1>
            </div>
            <p className="text-xs text-zinc-500">
              {postCount} {postCount === 1 ? "post" : "posts"}
            </p>
          </div>
        </div>
      </header>

      {/* POSTS */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        {posts.length === 0 ? (
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-900 flex items-center justify-center mx-auto mb-4 text-zinc-500">
              <Hash size={20} />
            </div>
            <h3 className="font-semibold font-display">No posts with #{tag}</h3>
            <p className="text-sm text-zinc-500 mt-2">
              Be the first to post with this hashtag!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

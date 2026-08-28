"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Bookmark } from "lucide-react";
import { onAuthStateChanged } from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import PostCard, { type Post } from "@/components/PostCard";
import { FeedSkeleton } from "@/components/skeletons/SkeletonPulse";

export default function SavedPostsPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
      if (user) {
        try {
          const profile = await syncProfile(user);
          if (profile) {
            setCurrentProfileId(profile.id);
            await loadSavedPosts(profile.id);
          }
        } catch (error) {
          console.error("❌ PROFILE SYNC ERROR:", error);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const loadSavedPosts = async (profileId: string) => {
    setLoading(true);
    try {
      // Get saved post IDs
      const { data: savedData, error: savedError } = await supabase
        .from("saved_posts")
        .select("post_id")
        .eq("user_id", profileId)
        .order("created_at", { ascending: false });

      if (savedError) throw savedError;

      if (!savedData || savedData.length === 0) {
        setPosts([]);
        setLoading(false);
        return;
      }

      const postIds = savedData.map((s) => s.post_id);

      // Fetch the actual posts
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
        .in("id", postIds);

      if (postsError) throw postsError;

      setPosts((postsData as Post[]) || []);
    } catch (error) {
      console.error("❌ LOAD SAVED POSTS ERROR:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-bg text-text-p pb-20">
      <div className="max-w-2xl mx-auto px-4 py-4">
        {/* HEADER */}
        <div className="flex items-center gap-3 mb-6">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-all"
            aria-label="Go back"
          >
            <ArrowLeft size={19} />
          </button>
          <div>
            <h1 className="text-lg font-bold font-display">Saved Posts</h1>
            <p className="text-xs text-text-t">Posts you&apos;ve bookmarked</p>
          </div>
        </div>

        {/* CONTENT */}
        {loading ? (
          <FeedSkeleton count={3} />
        ) : posts.length === 0 ? (
          <div className="rounded-2xl border border-border-s bg-bg-raised p-10 text-center">
            <div className="w-12 h-12 rounded-full bg-bg-sunken flex items-center justify-center mx-auto mb-4">
              <Bookmark size={24} className="text-text-t" />
            </div>
            <h3 className="font-semibold font-display">No saved posts</h3>
            <p className="text-sm text-text-t mt-2">
              Tap the bookmark icon on any post to save it here.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                currentProfileId={currentProfileId}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Settings, Grid3X3 } from "lucide-react";
import BottomNav from "@/components/BottomNav";

import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";
import PostCard, { type Post } from "@/components/PostCard";

type Profile = {
  id: string;
  firebase_uid: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [totalDrips, setTotalDrips] = useState(0);
  const [totalSkips, setTotalSkips] = useState(0);
  const [avatarError, setAvatarError] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      async (currentUser) => {
        if (!currentUser) {
          router.replace("/login");
          return;
        }

        try {
          setUser(currentUser);

          // Make sure the Supabase profile exists
          const syncedProfile = await syncProfile(currentUser);

          if (!isMounted) return;
          setProfile(syncedProfile);

          if (!syncedProfile?.id) {
            setLoading(false);
            return;
          }

          // Load user's posts
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
            .eq("user_id", syncedProfile.id)
            .order("created_at", { ascending: false });

          if (postsError) {
            console.error("❌ PROFILE POSTS ERROR:", postsError);
            if (isMounted) setLoading(false);
            return;
          }

          const userPosts = (postsData || []) as Post[];

          if (!isMounted) return;
          setPosts(userPosts);

          // Load total aggregated votes for user's posts
          if (userPosts.length > 0) {
            const postIds = userPosts.map((p) => p.id);

            const { data: votesData, error: votesError } = await supabase
              .from("votes")
              .select("vote")
              .in("fit_id", postIds);

            if (!votesError && votesData && isMounted) {
              let drips = 0;
              let skips = 0;

              votesData.forEach((v) => {
                if (v.vote === "drip") drips++;
                if (v.vote === "skip") skips++;
              });

              setTotalDrips(drips);
              setTotalSkips(skips);
            }
          }
        } catch (error) {
          console.error("❌ PROFILE LOAD FAILED:", error);
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-zinc-500">Loading profile...</p>
      </main>
    );
  }

  if (!user || !profile) {
    return null;
  }

  const avatarSrc =
    !avatarError && profile.avatar_url
      ? profile.avatar_url
      : "/default-avatar.png";

  return (
    <main className="min-h-screen bg-black text-white pb-24">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-zinc-900 bg-black/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto h-14 px-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>

          <h1 className="font-semibold">Profile</h1>

          <Link
            href="/settings"
            className="w-9 h-9 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
            aria-label="Settings"
          >
            <Settings size={19} />
          </Link>
        </div>
      </header>

      {/* PROFILE INFO */}
      <section className="max-w-2xl mx-auto px-4 pt-8">
        <div className="flex items-center gap-5">
          <img
            src={avatarSrc}
            alt={profile.display_name}
            onError={() => setAvatarError(true)}
            className="w-24 h-24 rounded-full object-cover border border-zinc-800"
          />

          <div className="min-w-0">
            <h2 className="text-xl font-bold truncate font-display">
              {profile.display_name}
            </h2>
            <p className="text-sm text-zinc-500 mt-1">@{profile.username}</p>
          </div>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-3 gap-2 mt-7">
          <div className="rounded-2xl bg-zinc-950 border border-zinc-900 p-4 text-center">
            <p className="text-lg font-bold">{posts.length}</p>
            <p className="text-xs text-zinc-500 mt-1">Posts</p>
          </div>

          <div className="rounded-2xl bg-zinc-950 border border-zinc-900 p-4 text-center">
            <p className="text-lg font-bold text-cyan-400">{totalDrips}</p>
            <p className="text-xs text-zinc-500 mt-1">Drips</p>
          </div>

          <div className="rounded-2xl bg-zinc-950 border border-zinc-900 p-4 text-center">
            <p className="text-lg font-bold text-rose-400">{totalSkips}</p>
            <p className="text-xs text-zinc-500 mt-1">Skips</p>
          </div>
        </div>

        {/* EDIT PROFILE */}
        <Link
          href="/profile/edit"
          className="mt-5 w-full h-11 rounded-xl border border-zinc-800 flex items-center justify-center text-sm font-semibold hover:bg-zinc-900 transition-colors"
        >
          Edit Profile
        </Link>
      </section>

      {/* POSTS LIST */}
      <section className="max-w-2xl mx-auto px-4 mt-10">
        <div className="flex items-center gap-2 mb-4">
          <Grid3X3 size={17} />            <h2 className="font-semibold font-display">Posts</h2>
        </div>

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-10 text-center">
            <p className="font-semibold">No posts yet.</p>
            <p className="text-sm text-zinc-500 mt-2">
              Share something with the council.
            </p>

            <Link
              href="/feed"
              className="inline-flex mt-5 px-5 py-2.5 rounded-xl bg-white text-black text-sm font-bold active:scale-95 transition-all"
            >
              Create a post
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>

        <BottomNav/>

    </main>
  );
}
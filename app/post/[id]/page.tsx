import { createClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import VideoPlayer from "@/components/VideoPlayer";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
);

// =====================================================
// DYNAMIC OG METADATA
// =====================================================

type PostRow = {
  id: string;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  profiles: {
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
};

async function getPost(id: string): Promise<PostRow | null> {
  const { data, error } = await supabase
    .from("posts")
    .select(
      `
      id,
      text,
      image_url,
      video_url,
      created_at,
      profiles (
        username,
        display_name,
        avatar_url
      )
    `
    )
    .eq("id", id)
    .single();

  if (error || !data) return null;

  // Supabase returns profiles as an array sometimes
  return { ...data, profiles: Array.isArray(data.profiles) ? data.profiles[0] : data.profiles } as unknown as PostRow;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(id);

  if (!post) {
    return { title: "Post not found" };
  }

  const profile = Array.isArray(post.profiles)
    ? post.profiles[0]
    : post.profiles;

  const title = profile
    ? `${profile.display_name} on Drip or Skip`
    : "Drip or Skip";

  const description = post.text
    ? post.text.length > 200
      ? post.text.slice(0, 197) + "..."
      : post.text
    : "Check out this post on Drip or Skip.";

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dripskip.com";

  const ogImage =
    post.image_url ||
    `${baseUrl}/api/og?title=${encodeURIComponent(description)}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${baseUrl}/post/${post.id}`,
      siteName: "Drip or Skip",
      images: [
        {
          url: ogImage,
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      type: "article",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

// =====================================================
// PAGE COMPONENT
// =====================================================

export default async function PublicPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPost(id);

  if (!post) {
    notFound();
  }

  const profile = Array.isArray(post.profiles)
    ? post.profiles[0]
    : post.profiles;

  const displayName =
    profile?.display_name || profile?.username || "Drip User";
  const username = profile?.username || "user";
  const avatar = profile?.avatar_url || "/default-avatar.png";

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dripskip.com";

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-50 border-b border-zinc-900 bg-black/90 backdrop-blur">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/feed"
            className="text-xl font-black tracking-tight"
          >
            Drip or Skip
          </Link>
          <Link
            href="/signup"
            className="px-4 py-2 rounded-xl bg-white text-black text-xs font-bold hover:bg-zinc-200 transition-colors"
          >
            Get the app
          </Link>
        </div>
      </header>

      <article className="max-w-2xl mx-auto px-4 py-8">
        {/* AUTHOR */}
        <div className="flex items-center gap-3 mb-5">
          <img
            src={avatar}
            alt={displayName}
            className="w-11 h-11 rounded-full object-cover border border-zinc-800"
          />
          <div>
            <p className="font-semibold text-sm">{displayName}</p>
            <p className="text-xs text-zinc-500">@{username}</p>
          </div>
        </div>

        {/* TEXT */}
        {post.text && (
          <p className="text-[15px] leading-7 text-zinc-100 whitespace-pre-wrap break-words mb-5">
            {post.text}
          </p>
        )}

        {/* IMAGE */}
        {post.image_url && (
          <div className="rounded-2xl overflow-hidden border border-zinc-900 mb-5">
            <img
              src={post.image_url}
              alt="Post content"
              className="w-full max-h-[600px] object-cover"
            />
          </div>
        )}

        {/* VIDEO */}
        {post.video_url && (
          <div className="rounded-2xl overflow-hidden border border-zinc-900 mb-5">
            <VideoPlayer
              src={post.video_url}
              className="w-full max-h-[600px]"
            />
          </div>
        )}

        {/* CTA */}
        <div className="mt-10 p-6 rounded-2xl border border-zinc-800 bg-zinc-950 text-center">
          <h2 className="font-bold text-lg mb-2">
            Want to vote on this?
          </h2>
          <p className="text-sm text-zinc-400 mb-5">
            Join Drip or Skip to vote drip or skip, comment, and share
            your own fits.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/signup"
              className="px-6 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 transition-colors"
            >
              Sign up free
            </Link>
            <Link
              href="/login"
              className="px-6 py-3 rounded-xl border border-zinc-700 text-white text-sm font-bold hover:bg-zinc-900 transition-colors"
            >
              Log in
            </Link>
          </div>
        </div>
      </article>
    </main>
  );
}

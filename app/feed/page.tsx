"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

interface Fit {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at?: string;

  profile?: {
    username: string;
    display_name?: string;
    avatar_url?: string;
  };

  drip_count: number;
  skip_count: number;
}

type VoteType = "drip" | "skip";

export default function FeedPage() {
  const router = useRouter();

  const [fits, setFits] = useState<Fit[]>([]);
  const [votes, setVotes] = useState<
    Record<string, VoteType>
  >({});

  const [user, setUser] = useState<any>(null);

  const [loading, setLoading] = useState(true);

  const [voting, setVoting] = useState<
    Record<string, boolean>
  >({});

  const [error, setError] = useState("");

  // ==========================================
  // LOAD FEED
  // ==========================================

  useEffect(() => {
    loadFeed();
  }, []);

  async function loadFeed() {
  try {
    setLoading(true);

    // 1. Get current user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      router.replace("/login");
      return;
    }

    // 2. Fetch followed user IDs & fits concurrently
    const [followsResult, fitsResult] = await Promise.all([
      supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id),
      supabase
        .from("fits")
        .select(`
          id,
          user_id,
          image_url,
          caption,
          created_at,
          profiles (
            id,
            username,
            display_name,
            avatar_url
          )
        `)
        .neq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (followsResult.error) {
      console.error("FOLLOWING LOAD ERROR:", followsResult.error);
    }

    if (fitsResult.error || !fitsResult.data || fitsResult.data.length === 0) {
      if (fitsResult.error) console.error("FEED LOAD ERROR:", fitsResult.error);
      setFits([]);
      return;
    }

    const followedSet = new Set(
      followsResult.data?.map((f) => f.following_id) || []
    );
    const fitsData = fitsResult.data;
    const fitIds = fitsData.map((fit) => fit.id);

    // 3. Get votes for candidate fits
    const { data: votesData, error: votesError } = await supabase
      .from("votes")
      .select("fit_id, user_id, vote")
      .in("fit_id", fitIds);

    if (votesError) {
      console.error("VOTES LOAD ERROR:", votesError);
    }

    // 4. Aggregate votes & identify already-voted fits
    const voteStats: Record<string, { drip: number; skip: number }> = {};
    const alreadyVotedSet = new Set<string>();

    votesData?.forEach((v) => {
      if (!voteStats[v.fit_id]) {
        voteStats[v.fit_id] = { drip: 0, skip: 0 };
      }

      if (v.vote === "drip") voteStats[v.fit_id].drip++;
      if (v.vote === "skip") voteStats[v.fit_id].skip++;

      if (v.user_id === user.id) {
        alreadyVotedSet.add(v.fit_id);
      }
    });

    // 5. Filter unvoted fits and append stats
    const candidates = fitsData
      .filter((fit) => !alreadyVotedSet.has(fit.id))
      .map((fit) => ({
        ...fit,
        drip_count: voteStats[fit.id]?.drip || 0,
        skip_count: voteStats[fit.id]?.skip || 0,
      }));

    if (candidates.length === 0) {
      setFits([]);
      return;
    }

    // 6. Partition into followed vs. community fits
    const followedFits: typeof candidates = [];
    const randomFits: typeof candidates = [];

    candidates.forEach((fit) => {
      if (followedSet.has(fit.user_id)) {
        followedFits.push(fit);
      } else {
        randomFits.push(fit);
      }
    });

    // 7. Fisher-Yates Shuffle
    const shuffle = <T,>(array: T[]): T[] => {
      const arr = [...array];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    };

    const shuffledFollowed = shuffle(followedFits);
    const shuffledRandom = shuffle(randomFits);

    // 8. Interleave 70% followed / 30% community feed
    const mixedFeed = [];
    let fIdx = 0;
    let rIdx = 0;

    while (fIdx < shuffledFollowed.length || rIdx < shuffledRandom.length) {
      // Pull up to 7 followed items
      for (let i = 0; i < 7 && fIdx < shuffledFollowed.length; i++) {
        mixedFeed.push(shuffledFollowed[fIdx++]);
      }
      // Pull up to 3 community items
      for (let i = 0; i < 3 && rIdx < shuffledRandom.length; i++) {
        mixedFeed.push(shuffledRandom[rIdx++]);
      }
    }

    setFits(mixedFeed);
  } catch (error) {
    console.error("UNEXPECTED FEED ERROR:", error);
  } finally {
    setLoading(false);
  }
}

  // ==========================================
  // HANDLE VOTE
  // ==========================================

  async function handleVote(
    fit: Fit,
    voteType: VoteType
  ) {
    if (!user) return;

    // Don't vote on your own fit
    if (fit.user_id === user.id) {
      return;
    }

    // Prevent double clicks
    if (voting[fit.id]) {
      return;
    }

    setVoting((current) => ({
      ...current,
      [fit.id]: true,
    }));

    try {
      const currentVote =
        votes[fit.id];

      // ======================================
      // REMOVE VOTE
      // ======================================

      if (currentVote === voteType) {
        const {
          error: deleteError,
        } = await supabase
          .from("votes")
          .delete()
          .eq("user_id", user.id)
          .eq("fit_id", fit.id);

        if (deleteError) {
          console.error(
            "VOTE DELETE ERROR:",
            deleteError
          );

          return;
        }

        // Remove user's vote
        setVotes((current) => {
          const updated = {
            ...current,
          };

          delete updated[fit.id];

          return updated;
        });

        // Decrease count
        setFits((currentFits) =>
          currentFits.map(
            (currentFit) => {
              if (
                currentFit.id !==
                fit.id
              ) {
                return currentFit;
              }

              return {
                ...currentFit,

                drip_count:
                  voteType === "drip"
                    ? Math.max(
                        0,
                        currentFit.drip_count -
                          1
                      )
                    : currentFit.drip_count,

                skip_count:
                  voteType === "skip"
                    ? Math.max(
                        0,
                        currentFit.skip_count -
                          1
                      )
                    : currentFit.skip_count,
              };
            }
          )
        );

        return;
      }

      // ======================================
      // SWITCH VOTE
      // ======================================

      if (currentVote) {
        const {
          error: updateError,
        } = await supabase
          .from("votes")
          .update({
            vote: voteType,
          })
          .eq("user_id", user.id)
          .eq("fit_id", fit.id);

        if (updateError) {
          console.error(
            "VOTE UPDATE ERROR:",
            updateError
          );

          return;
        }

        setVotes((current) => ({
          ...current,
          [fit.id]: voteType,
        }));

        // Update both counts
        setFits((currentFits) =>
          currentFits.map(
            (currentFit) => {
              if (
                currentFit.id !==
                fit.id
              ) {
                return currentFit;
              }

              return {
                ...currentFit,

                drip_count:
                  currentFit.drip_count +
                  (voteType === "drip"
                    ? 1
                    : -1),

                skip_count:
                  currentFit.skip_count +
                  (voteType === "skip"
                    ? 1
                    : -1),
              };
            }
          )
        );

        return;
      }

      // ======================================
      // NEW VOTE
      // ======================================

      const {
        error: insertError,
      } = await supabase
        .from("votes")
        .insert({
          user_id: user.id,
          fit_id: fit.id,
          vote: voteType,
        });

      if (insertError) {
        console.error(
          "VOTE INSERT ERROR:",
          insertError
        );

        return;
      }

      // Store user's vote
      setVotes((current) => ({
        ...current,
        [fit.id]: voteType,
      }));

      // Increase count
      setFits((currentFits) =>
        currentFits.map(
          (currentFit) => {
            if (
              currentFit.id !==
              fit.id
            ) {
              return currentFit;
            }

            return {
              ...currentFit,

              drip_count:
                currentFit.drip_count +
                (voteType === "drip"
                  ? 1
                  : 0),

              skip_count:
                currentFit.skip_count +
                (voteType === "skip"
                  ? 1
                  : 0),
            };
          }
        )
      );

    } finally {
      setVoting((current) => ({
        ...current,
        [fit.id]: false,
      }));
    }
  }

  // ==========================================
  // SIGN OUT
  // ==========================================

  async function handleSignOut() {
    await supabase.auth.signOut();

    router.push("/login");
  }

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="animate-pulse text-sm text-zinc-500">
          Loading feed...
        </p>
      </main>
    );
  }

  // ==========================================
  // ERROR
  // ==========================================

  if (error) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black p-6 text-white">
        <p className="text-sm text-red-400">
          {error}
        </p>

        <button
          onClick={loadFeed}
          className="mt-4 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black"
        >
          Try Again
        </button>
      </main>
    );
  }

  // ==========================================
  // FEED
  // ==========================================

  return (
    <main className="min-h-screen bg-black pb-24 text-white">

      {/* HEADER */}

      <header className="sticky top-0 z-50 border-b border-zinc-900 bg-black/90 backdrop-blur-xl">

        <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-4">

          <h1 className="text-xl font-black italic tracking-tight">
            Drip-or-Skip
          </h1>

          <button
            onClick={() =>
              router.push("/create")
            }
            className="rounded-full bg-white px-4 py-2 text-xs font-bold text-black transition active:scale-95"
          >
            + Post
          </button>

        </div>

      </header>

      {/* EMPTY FEED */}

      {fits.length === 0 && (
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">

          <div className="text-5xl">
            👀
          </div>

          <h2 className="mt-5 text-xl font-bold">
            No fits yet
          </h2>

          <p className="mt-2 max-w-xs text-sm text-zinc-500">
            Be the first person to post a fit.
          </p>

          <button
            onClick={() =>
              router.push("/create")
            }
            className="mt-6 rounded-2xl bg-white px-6 py-3 text-sm font-bold text-black"
          >
            Post Your Fit
          </button>

        </div>
      )}

      {/* FITS */}

      <div className="mx-auto max-w-xl">

        {fits.map((fit) => {
          const currentVote =
            votes[fit.id];

          const isOwnFit =
            fit.user_id === user?.id;

          const isVoting =
            voting[fit.id];

          return (
            <article
              key={fit.id}
              className="border-b border-zinc-900"
            >

              {/* USER */}

              <div className="flex items-center gap-3 px-5 py-4">

                <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-zinc-800">

                  {fit.profile?.avatar_url ? (
                    <img
                      src={
                        fit.profile.avatar_url
                      }
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold">
                      {(
                        fit.profile?.username ||
                        "?"
                      )[0].toUpperCase()}
                    </span>
                  )}

                </div>
                  
                <div>
                  <button
                    onClick={() =>
                      router.push(
                        `/profile/${fit.profile?.username}`
                      )
                    }
                    className="text-sm font-bold hover:underline"
                  >
                    @{fit.profile?.username || "user"}
                  </button>
                </div>

              </div>

              {/* IMAGE */}

              <div className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-950">

                <Image
                  src={fit.image_url}
                  alt={
                    fit.caption ||
                    "Drip-or-Skip fit"
                  }
                  fill
                  unoptimized
                  className="object-cover"
                />

              </div>

              {/* ACTION AREA */}

              <div className="px-5 py-5">

                {!isOwnFit ? (
                  <div className="grid grid-cols-2 gap-3">

                    {/* DRIP */}

                    <button
                      onClick={() =>
                        handleVote(
                          fit,
                          "drip"
                        )
                      }
                      disabled={isVoting}
                      className={`
                        flex items-center
                        justify-center gap-2
                        rounded-2xl py-4
                        text-sm font-black
                        transition-all
                        active:scale-95
                        ${
                          currentVote ===
                          "drip"
                            ? "scale-[1.02] bg-white text-black"
                            : "bg-zinc-900 text-white hover:bg-zinc-800"
                        }
                      `}
                    >
                      <span className="text-xl">
                        🔥
                      </span>

                      <span>
                        {currentVote ===
                        "drip"
                          ? "DRIPPED"
                          : "DRIP"}
                      </span>
                    </button>

                    {/* SKIP */}

                    <button
                      onClick={() =>
                        handleVote(
                          fit,
                          "skip"
                        )
                      }
                      disabled={isVoting}
                      className={`
                        flex items-center
                        justify-center gap-2
                        rounded-2xl py-4
                        text-sm font-black
                        transition-all
                        active:scale-95
                        ${
                          currentVote ===
                          "skip"
                            ? "scale-[1.02] bg-white text-black"
                            : "bg-zinc-900 text-white hover:bg-zinc-800"
                        }
                      `}
                    >
                      <span className="text-xl">
                        ❌
                      </span>

                      <span>
                        {currentVote ===
                        "skip"
                          ? "SKIPPED"
                          : "SKIP"}
                      </span>
                    </button>

                  </div>
                ) : (
                  <div className="rounded-2xl bg-zinc-950 py-4 text-center text-xs text-zinc-600">
                    This is your fit
                  </div>
                )}

                {/* COUNTS */}

                <div className="mt-4 flex items-center justify-between">

                  <div className="flex items-center gap-2">

                    <span className="text-sm">
                      🔥
                    </span>

                    <span className="text-sm font-bold text-white">
                      {fit.drip_count}
                    </span>

                    <span className="text-xs text-zinc-500">
                      Drips
                    </span>

                  </div>

                  <div className="flex items-center gap-2">

                    <span className="text-sm">
                      ❌
                    </span>

                    <span className="text-sm font-bold text-white">
                      {fit.skip_count}
                    </span>

                    <span className="text-xs text-zinc-500">
                      Skips
                    </span>

                  </div>

                </div>

                {/* CAPTION */}

                {fit.caption && (
                  <p className="mt-4 text-sm text-zinc-300">

                    <span className="font-bold text-white">
                      @
                      {fit.profile?.username ||
                        "user"}
                    </span>

                    {" "}

                    {fit.caption}

                  </p>
                )}

                {/* USER VOTE */}

                {currentVote &&
                  !isOwnFit && (
                    <p className="mt-3 text-xs text-zinc-600">
                      You voted{" "}
                      <span className="font-semibold text-zinc-400">
                        {currentVote ===
                        "drip"
                          ? "DRIP 🔥"
                          : "SKIP ❌"}
                      </span>
                    </p>
                  )}

              </div>

            </article>
          );
        })}

      </div>

      {/* BOTTOM NAV */}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-900 bg-black/95 backdrop-blur-xl">

        <div className="mx-auto flex max-w-xl items-center justify-around py-3">

          <button
            onClick={() =>
              router.push("/feed")
            }
            className="text-xl"
          >
            🏠
          </button>

          <button
            onClick={() => router.push("/discover")}
            className="text-xl transition active:scale-90"
          >
            🔍
          </button>

          <button
            onClick={() =>
              router.push("/create")
            }
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl text-black transition active:scale-90"
          >
            +
          </button>

          <button
            onClick={() =>
              router.push("/profile")
            }
            className="text-xl"
          >
            👤
          </button>

        </div>

      </nav>

    </main>
  );
}
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface Fit {
  id: string;
  user_id: string;
  image_url: string;
  caption: string | null;
  created_at: string;
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();

  const username = params.username as string;

  const [currentUser, setCurrentUser] =
    useState<any>(null);

  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [fits, setFits] =
    useState<Fit[]>([]);

  const [dripCount, setDripCount] =
    useState(0);

  const [followerCount, setFollowerCount] =
    useState(0);

  const [followingCount, setFollowingCount] =
    useState(0);

  const [isFollowing, setIsFollowing] =
    useState(false);

  const [loading, setLoading] =
    useState(true);

  const [followLoading, setFollowLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  // ==========================================
  // LOAD PROFILE
  // ==========================================

  useEffect(() => {
    if (username) {
      loadProfile();
    }
  }, [username]);

  async function loadProfile() {
    try {
      setLoading(true);
      setError("");

      // ----------------------------------------
      // CURRENT USER
      // ----------------------------------------

      const {
        data: {
          user,
        },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      setCurrentUser(user);

      // ----------------------------------------
      // PROFILE
      // ----------------------------------------

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url"
        )
        .eq("username", username)
        .maybeSingle();

      if (profileError) {
        console.error(
          "PUBLIC PROFILE ERROR:",
          profileError
        );

        setError(
          "Couldn't load this profile."
        );

        return;
      }

      if (!profileData) {
        setError(
          "This profile doesn't exist."
        );

        return;
      }

      setProfile(profileData);

      // ----------------------------------------
      // FITS
      // ----------------------------------------

      const {
        data: fitsData,
        error: fitsError,
      } = await supabase
        .from("fits")
        .select(
          "id, user_id, image_url, caption, created_at"
        )
        .eq("user_id", profileData.id)
        .order("created_at", {
          ascending: false,
        });

      if (fitsError) {
        console.error(
          "PUBLIC FITS ERROR:",
          fitsError
        );
      } else {
        setFits(fitsData || []);
      }

      // ----------------------------------------
      // DRIP COUNT
      // ----------------------------------------

      if (fitsData && fitsData.length > 0) {
        const fitIds = fitsData.map(
          (fit) => fit.id
        );

        const {
          data: dripData,
          error: dripError,
        } = await supabase
          .from("votes")
          .select("fit_id")
          .in("fit_id", fitIds)
          .eq("vote", "drip");

        if (dripError) {
          console.error(
            "DRIP COUNT ERROR:",
            dripError
          );
        } else {
          setDripCount(
            dripData?.length || 0
          );
        }
      }

      // ----------------------------------------
      // FOLLOWER COUNT
      // ----------------------------------------

      const {
        count: followers,
        error: followersError,
      } = await supabase
        .from("follows")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "following_id",
          profileData.id
        );

      if (followersError) {
        console.error(
          "FOLLOWER COUNT ERROR:",
          followersError
        );
      } else {
        setFollowerCount(
          followers || 0
        );
      }

      // ----------------------------------------
      // FOLLOWING COUNT
      // ----------------------------------------

      const {
        count: following,
        error: followingError,
      } = await supabase
        .from("follows")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "follower_id",
          profileData.id
        );

      if (followingError) {
        console.error(
          "FOLLOWING COUNT ERROR:",
          followingError
        );
      } else {
        setFollowingCount(
          following || 0
        );
      }

      // ----------------------------------------
      // CHECK IF CURRENT USER FOLLOWS THEM
      // ----------------------------------------

      if (user.id !== profileData.id) {
        const {
          data: followData,
          error: followError,
        } = await supabase
          .from("follows")
          .select("follower_id")
          .eq(
            "follower_id",
            user.id
          )
          .eq(
            "following_id",
            profileData.id
          )
          .maybeSingle();

        if (followError) {
          console.error(
            "FOLLOW CHECK ERROR:",
            followError
          );
        } else {
          setIsFollowing(
            !!followData
          );
        }
      }

    } catch (err) {
      console.error(
        "PROFILE PAGE ERROR:",
        err
      );

      setError(
        "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // FOLLOW / UNFOLLOW
  // ==========================================

  async function handleFollow() {
    if (
      !currentUser ||
      !profile ||
      followLoading
    ) {
      return;
    }

    if (
      currentUser.id === profile.id
    ) {
      return;
    }

    setFollowLoading(true);

    try {
      // ======================================
      // UNFOLLOW
      // ======================================

      if (isFollowing) {
        const {
          error: deleteError,
        } = await supabase
          .from("follows")
          .delete()
          .eq(
            "follower_id",
            currentUser.id
          )
          .eq(
            "following_id",
            profile.id
          );

        if (deleteError) {
          console.error(
            "UNFOLLOW ERROR:",
            deleteError
          );

          return;
        }

        setIsFollowing(false);

        setFollowerCount(
          (count) =>
            Math.max(0, count - 1)
        );

        return;
      }

      // ======================================
      // FOLLOW
      // ======================================

      const {
        error: insertError,
      } = await supabase
        .from("follows")
        .insert({
          follower_id:
            currentUser.id,

          following_id:
            profile.id,
        });

      if (insertError) {
        console.error(
          "FOLLOW ERROR:",
          insertError
        );

        return;
      }

      setIsFollowing(true);

      setFollowerCount(
        (count) => count + 1
      );

    } finally {
      setFollowLoading(false);
    }
  }

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="animate-pulse text-sm text-zinc-500">
          Loading profile...
        </p>
      </main>
    );
  }

  // ==========================================
  // ERROR
  // ==========================================

  if (error || !profile) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-black px-6 text-white">

        <p className="text-center text-sm text-red-400">
          {error ||
            "Profile not found."}
        </p>

        <button
          onClick={() =>
            router.push("/feed")
          }
          className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black"
        >
          Back to Feed
        </button>

      </main>
    );
  }

  const isOwnProfile =
    currentUser?.id === profile.id;

  // ==========================================
  // PAGE
  // ==========================================

  return (
    <main className="min-h-screen bg-black pb-24 text-white">

      {/* HEADER */}

      <header className="sticky top-0 z-50 border-b border-zinc-900 bg-black/90 backdrop-blur-xl">

        <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-4">

          <button
            onClick={() =>
              router.back()
            }
            className="text-xl transition active:scale-90"
          >
            ←
          </button>

          <h1 className="text-base font-bold">
            @{profile.username}
          </h1>

          <div className="w-5" />

        </div>

      </header>

      <div className="mx-auto max-w-xl">

        {/* PROFILE HEADER */}

        <section className="px-5 pb-7 pt-8">

          <div className="flex items-center gap-5">

            {/* AVATAR */}

            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-900 ring-1 ring-zinc-800">

              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={
                    profile.username
                  }
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-4xl">
                  👤
                </span>
              )}

            </div>

            {/* STATS */}

            <div className="flex flex-1 justify-around text-center">

              <div>
                <p className="text-xl font-black">
                  {fits.length}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  Fits
                </p>
              </div>

              <div>
                <p className="text-xl font-black">
                  {dripCount}
                </p>

                <p className="mt-1 text-xs text-zinc-500">
                  Drips
                </p>
              </div>

            </div>

          </div>

          {/* NAME */}

          <div className="mt-5">

            <h2 className="text-lg font-bold">
              {profile.display_name ||
                profile.username}
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              @{profile.username}
            </p>

          </div>

          {/* FOLLOW BUTTON */}

          {!isOwnProfile && (
            <button
              onClick={handleFollow}
              disabled={followLoading}
              className={`
                mt-5 w-full rounded-xl
                py-3 text-sm font-bold
                transition active:scale-[0.98]
                ${
                  isFollowing
                    ? "border border-zinc-800 bg-zinc-950 text-white"
                    : "bg-white text-black"
                }
              `}
            >
              {followLoading
                ? "Loading..."
                : isFollowing
                ? "Following"
                : "Follow"}
            </button>
          )}

          {/* FOLLOW STATS */}

          <div className="mt-5 flex justify-center gap-8 text-center">

            <div>
              <p className="text-sm font-bold">
                {followerCount}
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                Followers
              </p>
            </div>

            <div>
              <p className="text-sm font-bold">
                {followingCount}
              </p>

              <p className="mt-1 text-xs text-zinc-500">
                Following
              </p>
            </div>

          </div>

        </section>

        {/* DIVIDER */}

        <div className="border-t border-zinc-900" />

        {/* FITS TAB */}

        <div className="flex items-center justify-center border-b border-zinc-900 py-4">

          <span className="text-xs font-bold uppercase tracking-widest">
            Fits
          </span>

        </div>

        {/* FIT GRID */}

        {fits.length === 0 ? (

          <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 text-center">

            <div className="text-5xl">
              👕
            </div>

            <h3 className="mt-4 text-lg font-bold">
              No fits yet
            </h3>

            <p className="mt-2 text-sm text-zinc-500">
              This person hasn't
              posted any fits yet.
            </p>

          </div>

        ) : (

          <div className="grid grid-cols-3 gap-[2px]">

            {fits.map((fit) => (

              <button
                key={fit.id}
                onClick={() =>
                  router.push(
                    `/feed?fit=${fit.id}`
                  )
                }
                className="group relative aspect-square overflow-hidden bg-zinc-950"
              >

                <Image
                  src={fit.image_url}
                  alt={
                    fit.caption ||
                    "Fit"
                  }
                  fill
                  unoptimized
                  className="object-cover transition duration-300 group-hover:scale-105"
                />

              </button>

            ))}

          </div>

        )}

      </div>

      {/* BOTTOM NAV */}

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-900 bg-black/95 backdrop-blur-xl">

        <div className="mx-auto flex max-w-xl items-center justify-around py-3">

          <button
            onClick={() =>
              router.push("/feed")
            }
            className="text-xl transition active:scale-90"
          >
            🏠
          </button>

          <button
            onClick={() =>
              router.push("/create")
            }
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-xl font-light text-black transition active:scale-90"
          >
            +
          </button>

          <button
            onClick={() =>
              router.push("/profile")
            }
            className="text-xl transition active:scale-90"
          >
            👤
          </button>

        </div>

      </nav>

    </main>
  );
}
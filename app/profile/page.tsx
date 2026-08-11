"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] =
    useState<Profile | null>(null);

  const [fits, setFits] = useState<Fit[]>([]);

  const [dripCount, setDripCount] =
    useState(0);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  // ==========================================
  // LOAD PROFILE
  // ==========================================

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      setLoading(true);
      setError("");

      // ----------------------------------------
      // GET USER
      // ----------------------------------------

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      setUser(user);

      // ----------------------------------------
      // GET PROFILE
      // ----------------------------------------

      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.error(
          "PROFILE LOAD ERROR:",
          profileError
        );

        setError(
          "Couldn't load your profile."
        );

        return;
      }

      if (!profileData) {
        setError(
          "Profile not found."
        );

        return;
      }

      setProfile(profileData);

      // ----------------------------------------
      // GET USER'S FITS
      // ----------------------------------------

      const {
        data: fitsData,
        error: fitsError,
      } = await supabase
        .from("fits")
        .select(
          "id, user_id, image_url, caption, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", {
          ascending: false,
        });

      if (fitsError) {
        console.error(
          "FITS LOAD ERROR:",
          fitsError
        );
      } else {
        setFits(fitsData || []);
      }

      // ----------------------------------------
      // GET TOTAL DRIPS
      // ----------------------------------------

      if (fitsData && fitsData.length > 0) {
        const fitIds = fitsData.map(
          (fit) => fit.id
        );

        const {
          data: voteData,
          error: voteError,
        } = await supabase
          .from("votes")
          .select("fit_id, vote")
          .in("fit_id", fitIds)
          .eq("vote", "drip");

        if (voteError) {
          console.error(
            "DRIP COUNT ERROR:",
            voteError
          );
        } else {
          setDripCount(
            voteData?.length || 0
          );
        }
      } else {
        setDripCount(0);
      }

    } catch (err) {
      console.error(
        "PROFILE ERROR:",
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
  // LOGOUT
  // ==========================================

  async function handleSignOut() {
    await supabase.auth.signOut();

    router.replace("/login");
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
        <p className="text-sm text-red-400">
          {error || "Profile not found."}
        </p>

        <button
          onClick={() => router.push("/feed")}
          className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black"
        >
          Back to Feed
        </button>
      </main>
    );
  }

  // ==========================================
  // PROFILE
  // ==========================================

  return (
    <main className="min-h-screen bg-black pb-24 text-white">

      {/* ======================================
          HEADER
      ====================================== */}

      <header className="sticky top-0 z-50 border-b border-zinc-900 bg-black/90 backdrop-blur-xl">

        <div className="mx-auto flex max-w-xl items-center justify-between px-5 py-4">

          <button
            onClick={() =>
              router.push("/feed")
            }
            className="text-xl transition active:scale-90"
          >
            ←
          </button>

          <h1 className="text-base font-bold">
            Profile
          </h1>

          <button
            onClick={handleSignOut}
            className="text-xs font-semibold text-zinc-500 transition hover:text-white"
          >
            Sign out
          </button>

        </div>

      </header>

      <div className="mx-auto max-w-xl">

        {/* ====================================
            PROFILE HEADER
        ==================================== */}

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

          {/* EDIT BUTTON */}

          <button
            onClick={() =>
              router.push(
                "/profile/edit"
              )
            }
            className="mt-5 w-full rounded-xl border border-zinc-800 bg-zinc-950 py-3 text-sm font-bold transition hover:bg-zinc-900 active:scale-[0.98]"
          >
            Edit Profile
          </button>

        </section>

        {/* ====================================
            DIVIDER
        ==================================== */}

        <div className="border-t border-zinc-900" />

        {/* ====================================
            FITS HEADER
        ==================================== */}

        <div className="flex items-center justify-center border-b border-zinc-900 py-4">

          <span className="text-xs font-bold uppercase tracking-widest text-white">
            Fits
          </span>

        </div>

        {/* ====================================
            FIT GRID
        ==================================== */}

        {fits.length === 0 ? (

          <div className="flex min-h-[40vh] flex-col items-center justify-center px-6 text-center">

            <div className="text-5xl">
              👕
            </div>

            <h3 className="mt-4 text-lg font-bold">
              No fits yet
            </h3>

            <p className="mt-2 text-sm text-zinc-500">
              Post your first fit and
              let the world decide.
            </p>

            <button
              onClick={() =>
                router.push("/create")
              }
              className="mt-5 rounded-xl bg-white px-5 py-3 text-sm font-bold text-black"
            >
              Post a Fit
            </button>

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

                {/* HOVER OVERLAY */}

                <div className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/30 group-hover:opacity-100">

                  <span className="text-sm font-bold text-white">
                    View
                  </span>

                </div>

              </button>

            ))}

          </div>

        )}

      </div>

      {/* ======================================
          BOTTOM NAV
      ====================================== */}

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
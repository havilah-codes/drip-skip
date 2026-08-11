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

export default function DiscoverPage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [following, setFollowing] = useState<
    Record<string, boolean>
  >({});

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [followLoading, setFollowLoading] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    initialize();
  }, []);

  async function initialize() {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.replace("/login");
      return;
    }

    setUser(user);
    await loadProfiles(user.id);
  }

  // ==========================================
  // LOAD PROFILES
  // ==========================================

  async function loadProfiles(userId: string) {
    try {
      setLoading(true);

      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url"
        )
        .neq("id", userId)
        .order("username", {
          ascending: true,
        })
        .limit(30);

      if (error) {
        console.error(
          "DISCOVER PROFILE ERROR:",
          error
        );
        return;
      }

      setProfiles(data || []);

      await loadFollowing(
        userId,
        data || []
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // LOAD FOLLOWING STATUS
  // ==========================================

  async function loadFollowing(
    userId: string,
    profileList: Profile[]
  ) {
    if (profileList.length === 0) {
      return;
    }

    const profileIds = profileList.map(
      (profile) => profile.id
    );

    const {
      data,
      error,
    } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId)
      .in(
        "following_id",
        profileIds
      );

    if (error) {
      console.error(
        "FOLLOWING STATUS ERROR:",
        error
      );
      return;
    }

    const followingMap: Record<
      string,
      boolean
    > = {};

    data?.forEach((follow) => {
      followingMap[
        follow.following_id
      ] = true;
    });

    setFollowing(followingMap);
  }

  // ==========================================
  // SEARCH
  // ==========================================

  async function handleSearch(
    value: string
  ) {
    setSearch(value);

    if (!user) return;

    if (!value.trim()) {
      await loadProfiles(user.id);
      return;
    }

    try {
      setSearching(true);

      const searchTerm =
        value.trim().toLowerCase();

      const {
        data,
        error,
      } = await supabase
        .from("profiles")
        .select(
          "id, username, display_name, avatar_url"
        )
        .neq("id", user.id)
        .ilike(
          "username",
          `%${searchTerm}%`
        )
        .order("username", {
          ascending: true,
        })
        .limit(30);

      if (error) {
        console.error(
          "SEARCH ERROR:",
          error
        );
        return;
      }

      setProfiles(data || []);

      await loadFollowing(
        user.id,
        data || []
      );
    } finally {
      setSearching(false);
    }
  }

  // ==========================================
  // FOLLOW / UNFOLLOW
  // ==========================================

  async function toggleFollow(
    profile: Profile
  ) {
    if (!user) return;

    if (followLoading[profile.id]) {
      return;
    }

    setFollowLoading((current) => ({
      ...current,
      [profile.id]: true,
    }));

    try {
      const isCurrentlyFollowing =
        following[profile.id];

      // ----------------------------------------
      // UNFOLLOW
      // ----------------------------------------

      if (isCurrentlyFollowing) {
        const {
          error,
        } = await supabase
          .from("follows")
          .delete()
          .eq(
            "follower_id",
            user.id
          )
          .eq(
            "following_id",
            profile.id
          );

        if (error) {
          console.error(
            "UNFOLLOW ERROR:",
            error
          );
          return;
        }

        setFollowing((current) => ({
          ...current,
          [profile.id]: false,
        }));

        return;
      }

      // ----------------------------------------
      // FOLLOW
      // ----------------------------------------

      const {
        error,
      } = await supabase
        .from("follows")
        .insert({
          follower_id: user.id,
          following_id: profile.id,
        });

      if (error) {
        console.error(
          "FOLLOW ERROR:",
          error
        );
        return;
      }

      setFollowing((current) => ({
        ...current,
        [profile.id]: true,
      }));
    } finally {
      setFollowLoading((current) => ({
        ...current,
        [profile.id]: false,
      }));
    }
  }

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <p className="animate-pulse text-sm text-zinc-500">
          Loading...
        </p>
      </main>
    );
  }

  // ==========================================
  // PAGE
  // ==========================================

  return (
    <main className="min-h-screen bg-black pb-24 text-white">

      {/* HEADER */}

      <header className="sticky top-0 z-50 border-b border-zinc-900 bg-black/90 backdrop-blur-xl">

        <div className="mx-auto max-w-xl px-5 py-5">

          <div className="flex items-center gap-4">

            <button
              onClick={() =>
                router.push("/feed")
              }
              className="text-xl transition active:scale-90"
            >
              ←
            </button>

            <h1 className="text-xl font-black">
              Discover
            </h1>

          </div>

          {/* SEARCH */}

          <div className="relative mt-5">

            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
              🔍
            </span>

            <input
              type="text"
              value={search}
              onChange={(event) =>
                handleSearch(
                  event.target.value
                )
              }
              placeholder="Search usernames..."
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 py-3.5 pl-11 pr-4 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-600"
            />

          </div>

        </div>

      </header>

      {/* CONTENT */}

      <div className="mx-auto max-w-xl px-5">

        <div className="flex items-center justify-between py-5">

          <h2 className="text-sm font-bold">
            {search.trim()
              ? "Search results"
              : "People to follow"}
          </h2>

          {searching && (
            <span className="text-xs text-zinc-600">
              Searching...
            </span>
          )}

        </div>

        {/* NO RESULTS */}

        {profiles.length === 0 ? (

          <div className="flex flex-col items-center py-20 text-center">

            <div className="text-5xl">
              👀
            </div>

            <h2 className="mt-5 text-lg font-bold">
              No users found
            </h2>

            <p className="mt-2 text-sm text-zinc-500">
              Try searching for another
              username.
            </p>

          </div>

        ) : (

          <div className="space-y-2">

            {profiles.map((profile) => {

              const isFollowing =
                following[
                  profile.id
                ];

              const isLoading =
                followLoading[
                  profile.id
                ];

              return (
                <div
                  key={profile.id}
                  className="flex items-center gap-4 rounded-2xl p-3 transition hover:bg-zinc-950"
                >

                  {/* PROFILE */}

                  <button
                    onClick={() =>
                      router.push(
                        `/profile/${profile.username}`
                      )
                    }
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  >

                    {/* AVATAR */}

                    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-900">

                      {profile.avatar_url ? (
                        <Image
                          src={
                            profile.avatar_url
                          }
                          alt={
                            profile.username
                          }
                          width={48}
                          height={48}
                          unoptimized
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-lg">
                          👤
                        </span>
                      )}

                    </div>

                    {/* NAME */}

                    <div className="min-w-0">

                      <p className="truncate text-sm font-bold">
                        @{profile.username}
                      </p>

                      {profile.display_name && (
                        <p className="truncate text-xs text-zinc-500">
                          {
                            profile.display_name
                          }
                        </p>
                      )}

                    </div>

                  </button>

                  {/* FOLLOW */}

                  <button
                    onClick={() =>
                      toggleFollow(
                        profile
                      )
                    }
                    disabled={isLoading}
                    className={`
                      shrink-0 rounded-xl
                      px-4 py-2.5
                      text-xs font-bold
                      transition
                      active:scale-95
                      ${
                        isFollowing
                          ? "border border-zinc-800 bg-zinc-950 text-white"
                          : "bg-white text-black"
                      }
                    `}
                  >
                    {isLoading
                      ? "..."
                      : isFollowing
                      ? "Following"
                      : "Follow"}
                  </button>

                </div>
              );
            })}

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
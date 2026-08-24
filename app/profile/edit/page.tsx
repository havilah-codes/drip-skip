"use client";

import {
  useEffect,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Camera, Loader2 } from "lucide-react";

import {
  onAuthStateChanged,
  updateProfile,
  type User,
} from "firebase/auth";

import { firebaseAuth } from "@/lib/firebase";
import { supabase } from "@/lib/supabase";
import { syncProfile } from "@/lib/syncProfile";

export default function EditProfilePage() {
  const router = useRouter();

  const [user, setUser] =
    useState<User | null>(null);

  const [profileId, setProfileId] =
    useState<string | null>(null);

  const [displayName, setDisplayName] =
    useState("");

  const [username, setUsername] =
    useState("");

  const [avatarUrl, setAvatarUrl] =
    useState("/default-avatar.png");

  const [selectedAvatar, setSelectedAvatar] =
    useState<File | null>(null);

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  // ==========================================
  // LOAD PROFILE
  // ==========================================

  useEffect(() => {
    const unsubscribe =
      onAuthStateChanged(
        firebaseAuth,
        async (currentUser) => {
          if (!currentUser) {
            router.replace("/login");
            return;
          }

          try {
            setUser(currentUser);

            const profile =
              await syncProfile(
                currentUser
              );

            if (!profile) {
              throw new Error(
                "Could not load your profile."
              );
            }

            setProfileId(profile.id);

            setDisplayName(
              profile.display_name || ""
            );

            setUsername(
              profile.username || ""
            );

            setAvatarUrl(
              profile.avatar_url ||
                "/default-avatar.png"
            );
          } catch (err) {
            console.error(
              "❌ EDIT PROFILE LOAD ERROR:",
              err
            );

            setError(
              "Could not load your profile."
            );
          } finally {
            setLoading(false);
          }
        }
      );

    return () => unsubscribe();
  }, [router]);

  // ==========================================
  // AVATAR SELECT
  // ==========================================

  const handleAvatarSelect = (
    event: ChangeEvent<HTMLInputElement>
  ) => {
    const file =
      event.target.files?.[0];

    if (!file) {
      return;
    }

    // Basic size protection
    if (file.size > 5 * 1024 * 1024) {
      setError(
        "Profile pictures must be smaller than 5MB."
      );

      event.target.value = "";
      return;
    }

    setError("");
    setSelectedAvatar(file);

    event.target.value = "";
  };

  // ==========================================
  // SAVE PROFILE
  // ==========================================

  const handleSave = async (
    event: FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault();

    if (!user || !profileId) {
      return;
    }

    setError("");

    const cleanDisplayName =
      displayName.trim();

    const cleanUsername =
      username
        .trim()
        .toLowerCase();

    // ==========================================
    // VALIDATION
    // ==========================================

    if (!cleanDisplayName) {
      setError(
        "Display name cannot be empty."
      );

      return;
    }

    if (!cleanUsername) {
      setError(
        "Username cannot be empty."
      );

      return;
    }

    if (
      !/^[a-z0-9_.]{3,30}$/.test(
        cleanUsername
      )
    ) {
      setError(
        "Username must be 3–30 characters and can only contain letters, numbers, _ and ."
      );

      return;
    }

    setSaving(true);

    try {
      let newAvatarUrl =
        avatarUrl ===
        "/default-avatar.png"
          ? null
          : avatarUrl;

      // ==========================================
      // UPLOAD NEW AVATAR
      // ==========================================

      if (selectedAvatar) {
        const extension =
          selectedAvatar.name
            .split(".")
            .pop() || "jpg";

        const filePath =
          `${profileId}/${crypto.randomUUID()}.${extension}`;

        console.log(
          "📸 UPLOADING AVATAR:",
          filePath
        );

        const {
          error: uploadError,
        } = await supabase.storage
          .from("avatars")
          .upload(
            filePath,
            selectedAvatar,
            {
              upsert: false,
            }
          );

        if (uploadError) {
          throw uploadError;
        }

        const {
          data: publicUrlData,
        } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        newAvatarUrl =
          publicUrlData.publicUrl;

        console.log(
          "✅ NEW AVATAR:",
          newAvatarUrl
        );
      }

      // ==========================================
      // UPDATE PROFILE
      // ==========================================

      const {
        data: updatedProfile,
        error: updateError,
      } = await supabase
        .from("profiles")
        .update({
          display_name:
            cleanDisplayName,
          username:
            cleanUsername,
          avatar_url:
            newAvatarUrl,
        })
        .eq(
          "id",
          profileId
        )
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }

      console.log(
        "✅ PROFILE UPDATED:",
        updatedProfile
      );

      // ==========================================
      // SYNC FIREBASE AUTH PHOTO URL
      // ==========================================

      if (newAvatarUrl && user) {
        try {
          await updateProfile(user, {
            photoURL: newAvatarUrl,
          });
          console.log(
            "✅ FIREBASE PHOTO URL UPDATED"
          );
        } catch (firebaseErr) {
          console.error(
            "❌ FIREBASE PHOTO UPDATE FAILED:",
            firebaseErr
          );
        }
      }

      // ==========================================
      // GO BACK TO PROFILE
      // ==========================================

      router.replace(
        `/profile/${updatedProfile.username}`
      );

      router.refresh();
    } catch (err: any) {
      console.error(
        "❌ PROFILE UPDATE ERROR:",
        err
      );

      if (
        err?.code === "23505"
      ) {
        setError(
          "That username is already taken."
        );
      } else {
        setError(
          err?.message ||
            "Could not update your profile."
        );
      }
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // PREVIEW
  // ==========================================

  const previewAvatar =
    selectedAvatar
      ? URL.createObjectURL(
          selectedAvatar
        )
      : avatarUrl;

  // ==========================================
  // LOADING
  // ==========================================

  if (loading) {
    return (
      <main className="min-h-screen bg-bg text-text-p flex items-center justify-center">
        <Loader2
          size={24}
          className="animate-spin text-text-t"
        />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg text-text-p">

      {/* ====================================== */}
      {/* HEADER */}
      {/* ====================================== */}

      <header className="sticky top-0 z-40 border-b border-border-s bg-bg/85 backdrop-blur-xl">

        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center">

          <button
            type="button"
            onClick={() =>
              router.back()
            }
            className="w-9 h-9 rounded-full flex items-center justify-center text-text-s hover:text-text-p hover:bg-bg-sunken transition-all"
          >
            <ArrowLeft size={19} />
          </button>

          <h1 className="ml-3 font-semibold font-display">
            Edit Profile
          </h1>

        </div>

      </header>

      {/* ====================================== */}
      {/* CONTENT */}
      {/* ====================================== */}

      <div className="max-w-2xl mx-auto px-4 py-8 pb-28">

        <form
          onSubmit={handleSave}
          className="space-y-8"
        >

          {/* ==================================== */}
          {/* AVATAR */}
          {/* ==================================== */}

          <section className="flex flex-col items-center">

            <div className="relative">

              <img
                src={previewAvatar}
                alt="Profile"
                className="w-28 h-28 rounded-full object-cover border-4 border-border-s bg-bg-raised"
              />

              <label
                htmlFor="avatar"
                className="absolute bottom-0 right-0 w-10 h-10 rounded-full bg-btn text-btn-text flex items-center justify-center cursor-pointer shadow-xl hover:bg-btn/80 transition-colors"
              >
                <Camera size={18} />

                <input
                  id="avatar"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={
                    handleAvatarSelect
                  }
                />
              </label>

            </div>

            <p className="text-xs text-text-t mt-3">
              Change profile photo
            </p>

          </section>

          {/* ==================================== */}
          {/* FORM */}
          {/* ==================================== */}

          <section className="space-y-5">

            {/* DISPLAY NAME */}

            <div>
              <label
                htmlFor="display-name"
                className="block text-sm font-medium mb-2"
              >
                Display name
              </label>

              <input
                id="display-name"
                value={displayName}
                onChange={(event) =>
                  setDisplayName(
                    event.target.value
                  )
                }
                maxLength={50}
                className="w-full rounded-xl border border-border-d bg-bg-raised px-4 py-3 text-sm outline-none focus:border-zinc-500 transition-colors"
                placeholder="Your name"
              />
            </div>

            {/* USERNAME */}

            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium mb-2"
              >
                Username
              </label>

              <div className="relative">

                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-m">
                  @
                </span>

                <input
                  id="username"
                  value={username}
                  onChange={(event) =>
                    setUsername(
                      event.target.value
                        .toLowerCase()
                        .replace(
                          /[^a-z0-9_.]/g,
                          ""
                        )
                    )
                  }
                  maxLength={30}
                  className="w-full rounded-xl border border-border-d bg-bg-raised pl-9 pr-4 py-3 text-sm outline-none focus:border-zinc-500 transition-colors"
                  placeholder="username"
                />

              </div>

              <p className="text-xs text-text-m mt-2">
                3–30 characters · letters,
                numbers, _ and .
              </p>
            </div>

          </section>

          {/* ==================================== */}
          {/* ERROR */}
          {/* ==================================== */}

          {error && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {/* ==================================== */}
          {/* SAVE */}
          {/* ==================================== */}

          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-xl bg-btn text-btn-text py-3.5 text-sm font-bold hover:bg-btn/80 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2
                  size={17}
                  className="animate-spin"
                />
                Saving...
              </span>
            ) : (
              "Save changes"
            )}
          </button>

        </form>

      </div>

    </main>
  );
}
"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function compressAvatar(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const maxSize = 800;

      let width = image.naturalWidth;
      let height = image.naturalHeight;

      if (width > maxSize || height > maxSize) {
        const scale = Math.min(
          maxSize / width,
          maxSize / height
        );

        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");

      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Could not create canvas."));
        return;
      }

      context.drawImage(
        image,
        0,
        0,
        width,
        height
      );

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(
              new Error("Could not compress image.")
            );
            return;
          }

          resolve(blob);
        },
        "image/jpeg",
        0.85
      );
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(
        new Error("Could not load image.")
      );
    };

    image.src = objectUrl;
  });
}

export default function ProfilePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);

  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");

  const [selectedFile, setSelectedFile] =
    useState<File | null>(null);

  const [previewUrl, setPreviewUrl] =
    useState("");

  const [existingAvatar, setExistingAvatar] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [saving, setSaving] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    loadProfile();

    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, []);

  async function loadProfile() {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      setUser(user);

      const {
        data: profile,
        error: profileError,
      } = await supabase
        .from("profiles")
        .select(
          "username, display_name, avatar_url"
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

      if (profile) {
        setUsername(profile.username || "");
        setDisplayName(
          profile.display_name || ""
        );
        setExistingAvatar(
          profile.avatar_url || ""
        );
      }
    } catch (err) {
      console.error(
        "PROFILE LOAD ERROR:",
        err
      );

      setError(
        "Something went wrong."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleFileChange(
    e: ChangeEvent<HTMLInputElement>
  ) {
    setError("");

    const file = e.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError(
        "Please choose a JPG, PNG, or WEBP image."
      );

      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        "Your profile picture must be under 5 MB."
      );

      e.target.value = "";
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const newPreview =
      URL.createObjectURL(file);

    setSelectedFile(file);
    setPreviewUrl(newPreview);
  }

  async function handleSubmit(
    e: FormEvent
  ) {
    e.preventDefault();

    if (!user || saving) return;

    setError("");
    setSaving(true);

    try {
      let avatarUrl = existingAvatar;

      // ----------------------------------------
      // UPLOAD NEW AVATAR
      // ----------------------------------------

      if (selectedFile) {
        console.log(
          "PROFILE: COMPRESSING AVATAR"
        );

        const compressedAvatar =
          await compressAvatar(selectedFile);

        const timestamp = Date.now();

        const randomString =
          Math.random()
            .toString(36)
            .substring(2, 9);

        const filePath =
          `${user.id}/${timestamp}-${randomString}.jpg`;

        console.log(
          "PROFILE: UPLOADING AVATAR",
          filePath
        );

        const {
          data: uploadData,
          error: uploadError,
        } = await supabase.storage
          .from("avatars")
          .upload(
            filePath,
            compressedAvatar,
            {
              cacheControl: "3600",
              upsert: false,
              contentType: "image/jpeg",
            }
          );

        if (uploadError) {
          console.error(
            "AVATAR UPLOAD ERROR:",
            uploadError.message
          );

          throw new Error(
            "Could not upload profile picture."
          );
        }

        console.log(
          "PROFILE: AVATAR UPLOADED",
          uploadData.path
        );

        // --------------------------------------
        // GET PUBLIC URL
        // --------------------------------------

        const {
          data: publicUrlData,
        } = supabase.storage
          .from("avatars")
          .getPublicUrl(filePath);

        avatarUrl =
          publicUrlData.publicUrl;

        if (!avatarUrl) {
          throw new Error(
            "Could not generate avatar URL."
          );
        }
      }

      // ----------------------------------------
      // UPDATE PROFILE
      // ----------------------------------------

      console.log(
        "PROFILE: UPDATING PROFILE"
      );

      const {
        error: profileError,
      } = await supabase
        .from("profiles")
        .update({
          username:
            username.trim(),
          display_name:
            displayName.trim() || null,
          avatar_url:
            avatarUrl || null,
        })
        .eq("id", user.id);

      if (profileError) {
        console.error(
          "PROFILE UPDATE ERROR:",
          {
            message: profileError.message,
            details: profileError.details,
            hint: profileError.hint,
            code: profileError.code,
          }
        );

        throw new Error(
          "Could not update your profile."
        );
      }

      console.log(
        "PROFILE: SUCCESS"
      );

      router.push("/feed");
      router.refresh();

    } catch (err) {
      console.error(
        "PROFILE SAVE ERROR:",
        err
      );

      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong."
      );

      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-white flex items-center justify-center">
        <p className="text-sm text-zinc-500">
          Loading profile...
        </p>
      </main>
    );
  }

  const displayedAvatar =
    previewUrl || existingAvatar;

  return (
    <main className="min-h-screen bg-black text-white">

        

      <div className="mx-auto max-w-md px-6 py-10">

        <button
            onClick={() =>
              router.push("/feed")
            }
            className="text-xl"
          >
            ← Back
        </button>

        {/* HEADER */}

        <div className="mb-10 text-center">

          <h1 className="text-3xl font-black">
            Your Profile
          </h1>

          <p className="mt-2 text-sm text-zinc-500">
            Show everyone who's behind the drip.
          </p>

        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-7"
        >

          {/* AVATAR */}

          <div className="flex justify-center">

            <label className="group relative cursor-pointer">

              <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-full bg-zinc-900 ring-2 ring-zinc-800">

                {displayedAvatar ? (
                  <Image
                    src={displayedAvatar}
                    alt="Profile picture"
                    width={128}
                    height={128}
                    unoptimized
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-5xl">
                    👤
                  </span>
                )}

              </div>

              <div className="absolute bottom-1 right-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg text-black shadow-lg">
                +
              </div>

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />

            </label>

          </div>

          <p className="text-center text-xs text-zinc-500">
            Tap your photo to change it
          </p>

          {/* USERNAME */}

          <div>

            <label
              htmlFor="username"
              className="mb-2 block text-sm font-semibold"
            >
              Username
            </label>

            <div className="flex items-center rounded-2xl border border-zinc-800 bg-zinc-950 px-4">
              <span className="text-zinc-500">
                @
              </span>

              <input
                id="username"
                value={username}
                onChange={(e) =>
                  setUsername(
                    e.target.value
                      .toLowerCase()
                      .replace(
                        /[^a-z0-9_]/g,
                        ""
                      )
                  )
                }
                maxLength={30}
                required
                className="w-full bg-transparent px-2 py-4 outline-none"
                placeholder="username"
              />
            </div>

          </div>

          {/* DISPLAY NAME */}

          <div>

            <label
              htmlFor="displayName"
              className="mb-2 block text-sm font-semibold"
            >
              Display name
            </label>

            <input
              id="displayName"
              value={displayName}
              onChange={(e) =>
                setDisplayName(e.target.value)
              }
              maxLength={50}
              className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-4 outline-none focus:border-zinc-500"
              placeholder="Your name"
            />

          </div>

          {/* ERROR */}

          {error && (
            <div className="rounded-2xl bg-red-950/50 px-4 py-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* SAVE */}

          <button
            type="submit"
            disabled={
              saving ||
              !username.trim()
            }
            className="w-full rounded-2xl bg-white px-5 py-4 font-bold text-black transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving
              ? "Saving..."
              : "Save Profile"}
          </button>

        </form>

      </div>

    </main>
  );
}
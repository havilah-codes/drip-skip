"use client";

import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { CreateSkeleton } from "@/components/skeletons/CreateSkeleton";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_CAPTION_LENGTH = 150;

function compressImage(
  file: File,
  maxDimension = 1600,
  quality = 0.85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = document.createElement("img");
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let width = img.naturalWidth;
      let height = img.naturalHeight;

      if (width > maxDimension || height > maxDimension) {
        const scale = Math.min(
          maxDimension / width,
          maxDimension / height
        );

        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");

      if (!context) {
        reject(new Error("Could not create canvas context."));
        return;
      }

      context.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Image compression failed."));
            return;
          }

          resolve(blob);
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load image."));
    };

    img.src = objectUrl;
  });
}

export default function CreatePage() {
  const router = useRouter();

  const [user, setUser] = useState<any>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [error, setError] = useState("");
  const [statusText, setStatusText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // ------------------------------------------
  // AUTH
  // ------------------------------------------

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      setUser(user);
      setIsLoading(false);
    };

    loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;

      if (!session?.user) {
        router.replace("/login");
        return;
      }

      setUser(session.user);
      setIsLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  // ------------------------------------------
  // CLEAN UP PREVIEW URL
  // ------------------------------------------

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // ------------------------------------------
  // IMAGE SELECTION
  // ------------------------------------------

  const handleFileChange = (
    e: ChangeEvent<HTMLInputElement>
  ) => {
    setError("");

    const file = e.target.files?.[0];

    if (!file) return;

    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!allowedTypes.includes(file.type)) {
      setError(
        "Please choose a JPG, PNG, WEBP, or GIF image."
      );

      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(
        "That image is too large. Choose one under 10 MB."
      );

      e.target.value = "";
      return;
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    const newPreviewUrl = URL.createObjectURL(file);

    setSelectedFile(file);
    setPreviewUrl(newPreviewUrl);
  };

  // ------------------------------------------
  // REMOVE IMAGE
  // ------------------------------------------

  const handleRemoveImage = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setSelectedFile(null);
    setPreviewUrl("");
    setError("");
  };

  // ------------------------------------------
  // CAPTION
  // ------------------------------------------

  const handleCaptionChange = (
    e: ChangeEvent<HTMLTextAreaElement>
  ) => {
    setCaption(
      e.target.value.slice(0, MAX_CAPTION_LENGTH)
    );
  };

  // ------------------------------------------
  // SUBMIT
  // ------------------------------------------

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!selectedFile || !user || isSubmitting) {
      return;
    }

    setError("");
    setIsSubmitting(true);
    setStatusText("Uploading...");

    try {
      console.log("CREATE FIT: START");

      // ----------------------------------------
      // COMPRESS IMAGE
      // ----------------------------------------

      let fileToUpload: Blob = selectedFile;
      let extension =
        selectedFile.name
          .split(".")
          .pop()
          ?.toLowerCase() || "jpg";

      if (selectedFile.type !== "image/gif") {
        try {
          console.log("CREATE FIT: COMPRESSING");

          const compressedBlob = await compressImage(
            selectedFile,
            1600,
            0.85
          );

          fileToUpload = compressedBlob;
          extension = "jpg";

          console.log(
            "CREATE FIT: COMPRESSION SUCCESS",
            {
              originalSize: selectedFile.size,
              compressedSize: compressedBlob.size,
            }
          );
        } catch (compressionError) {
          console.warn(
            "Compression failed. Using original file.",
            compressionError
          );

          fileToUpload = selectedFile;
        }
      }

      // ----------------------------------------
      // STORAGE PATH
      // ----------------------------------------

      const timestamp = Date.now();

      const randomString = Math.random()
        .toString(36)
        .substring(2, 9);

      const filePath =
        `${user.id}/${timestamp}-${randomString}.${extension}`;

      console.log("CREATE FIT: UPLOADING", {
        bucket: "fit-images",
        filePath,
        fileSize: fileToUpload.size,
        fileType: fileToUpload.type,
      });

      // ----------------------------------------
      // UPLOAD IMAGE
      // ----------------------------------------

      const {
        data: uploadData,
        error: uploadError,
      } = await supabase.storage
        .from("fit-images")
        .upload(
          filePath,
          fileToUpload,
          {
            cacheControl: "3600",
            upsert: false,
            contentType:
              fileToUpload.type || "image/jpeg",
          }
        );

      if (uploadError) {
        console.error(
          "CREATE FIT: STORAGE ERROR",
          uploadError.message
        );

        setError(
          "Couldn't upload your fit. Please try again."
        );

        setIsSubmitting(false);
        setStatusText("");
        return;
      }

      console.log(
        "CREATE FIT: UPLOAD SUCCESS",
        uploadData
      );

      // ----------------------------------------
      // PUBLIC URL
      // ----------------------------------------

      setStatusText("Publishing...");

      console.log(
        "CREATE FIT: GETTING PUBLIC URL"
      );

      const {
        data: publicUrlData,
      } = supabase.storage
        .from("fit-images")
        .getPublicUrl(filePath);

      const publicImageUrl =
        publicUrlData?.publicUrl;

      if (!publicImageUrl) {
        console.error(
          "CREATE FIT: PUBLIC URL ERROR"
        );

        setError(
          "Couldn't generate the photo URL. Please try again."
        );

        setIsSubmitting(false);
        setStatusText("");
        return;
      }

      console.log(
        "CREATE FIT: PUBLIC URL SUCCESS"
      );

      // ----------------------------------------
      // DATABASE INSERT
      // ----------------------------------------

      console.log(
        "CREATE FIT: INSERTING DATABASE ROW"
      );

      const {
        data: insertedFit,
        error: dbError,
      } = await supabase
        .from("fits")
        .insert({
          user_id: user.id,
          image_url: publicImageUrl,
          caption: caption.trim() || null,
        })
        .select()
        .single();

      if (dbError) {
        console.error(
          "CREATE FIT: DATABASE ERROR",
          {
            message: dbError.message,
            details: dbError.details,
            hint: dbError.hint,
            code: dbError.code,
          }
        );

        setError(
          "Your photo uploaded, but we couldn't publish the fit."
        );

        setIsSubmitting(false);
        setStatusText("");
        return;
      }

      console.log(
        "CREATE FIT: DATABASE INSERT SUCCESS",
        insertedFit
      );

      // ----------------------------------------
      // SUCCESS
      // ----------------------------------------

      setStatusText("Done!");

      console.log(
        "CREATE FIT: REDIRECTING"
      );

      router.push("/feed");

    } catch (err: unknown) {
      console.error(
        "CREATE FIT: UNEXPECTED ERROR",
        err
      );

      if (err instanceof Error) {
        console.error(
          "Error message:",
          err.message
        );

        console.error(
          "Error stack:",
          err.stack
        );
      }

      setError(
        "Something went wrong. Please try again."
      );

      setIsSubmitting(false);
      setStatusText("");
    }
  };

  // ------------------------------------------
  // LOADING
  // ------------------------------------------

  if (isLoading) {
    return <CreateSkeleton />;
  }

  // ------------------------------------------
  // PAGE
  // ------------------------------------------

  return (
    <main className="min-h-screen bg-white dark:bg-bg">
      <div className="mx-auto w-full max-w-xl px-4 pb-10">

        {/* Header */}

        <header className="flex items-center justify-between py-5">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm font-medium"
          >
            ← Back
          </button>

          <h1 className="text-lg font-semibold font-display">
            New Fit
          </h1>

          <div className="w-12" />
        </header>

        <form
          onSubmit={handleSubmit}
          className="space-y-6"
        >

          {/* IMAGE PICKER */}

          <div>
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-3xl bg-gray-100">
                <div className="relative aspect-[4/5] w-full">
                  <Image
                    src={previewUrl}
                    alt="Fit preview"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute right-4 top-4 rounded-full bg-bg/70 px-4 py-2 text-sm font-medium text-text-p backdrop-blur"
                >
                  Change
                </button>
              </div>
            ) : (
              <label className="flex aspect-[4/5] w-full cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-gray-300 bg-gray-50 transition hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-950">

                <span className="text-4xl">
                  +
                </span>

                <span className="mt-3 text-lg font-semibold">
                  Add your fit
                </span>

                <span className="mt-1 text-sm text-gray-500">
                  JPG, PNG, WEBP or GIF
                </span>

                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* ERROR */}

          {error && (
            <div
              role="alert"
              className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              {error}
            </div>
          )}

          {/* CAPTION */}

          <div>
            <label
              htmlFor="caption"
              className="mb-2 block text-sm font-semibold"
            >
              Caption
            </label>

            <textarea
              id="caption"
              value={caption}
              onChange={handleCaptionChange}
              maxLength={MAX_CAPTION_LENGTH}
              rows={3}
              placeholder="What's the verdict?"
              disabled={isSubmitting}
              className="w-full resize-none rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 outline-none transition focus:border-black dark:border-gray-800 dark:bg-gray-950 dark:focus:border-white"
            />

            <div className="mt-2 text-right text-xs text-gray-500">
              {caption.length}/{MAX_CAPTION_LENGTH}
            </div>
          </div>

          {/* STATUS */}

          {statusText && (
            <p
              className="text-center text-sm text-gray-500"
              aria-live="polite"
            >
              {statusText}
            </p>
          )}

          {/* POST BUTTON */}

          <button
            type="submit"
            disabled={
              !selectedFile ||
              !user ||
              isSubmitting
            }
            className="w-full rounded-2xl bg-bg px-5 py-4 font-semibold text-text-p transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {isSubmitting
              ? statusText || "Posting..."
              : "Post Fit"}
          </button>

        </form>
      </div>
    </main>
  );
}
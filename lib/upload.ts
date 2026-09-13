/**
 * Client-side upload helper.
 *
 * 1. Asks our /api/upload route for a presigned S3 URL (server verifies auth).
 * 2. PUTs the file directly to S3 using the presigned URL.
 * 3. Returns the final public URL to store in the database.
 */

import { firebaseAuth } from "@/lib/firebase";

export type UploadBucket =
  | "post-images"
  | "post-videos"
  | "fit-images"
  | "avatars";

interface UploadResult {
  publicUrl: string;
}

/**
 * Upload a file to S3 via presigned URL.
 *
 * @param bucket   One of the Supabase-compatible bucket names (mapped server-side to S3 folders).
 * @param file     The File or Blob to upload.
 * @param onProgress  Optional progress callback (not available for presigned uploads, but kept for future use).
 */
export async function uploadToS3(
  bucket: UploadBucket,
  file: File
): Promise<UploadResult> {
  // ── Step 1: Get presigned URL from our API (auth via Firebase ID token) ──
  const user = firebaseAuth.currentUser;
  if (!user) {
    throw new Error("You must be signed in to upload.");
  }
  const idToken = await user.getIdToken();

  const res = await fetch("/api/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      bucket,
      fileName: file.name,
      contentType: file.type,
      fileSize: file.size,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Upload request failed" }));
    throw new Error(err.error || `Upload request failed (${res.status})`);
  }

  const { uploadUrl, publicUrl } = await res.json();

  // ── Step 2: PUT the file directly to S3 ──
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
    },
    body: file,
  });

  if (!putRes.ok) {
    throw new Error(`S3 upload failed (${putRes.status})`);
  }

  return { publicUrl };
}

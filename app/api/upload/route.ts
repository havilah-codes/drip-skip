import { NextRequest, NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/firebase-admin";
import { createPresignedUploadUrl } from "@/lib/s3";

const ALLOWED_TYPES = new Set([
  // Images
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // Videos
  "video/mp4",
  "video/webm",
  "video/quicktime",
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Map bucket names to folder prefixes
const BUCKET_FOLDER: Record<string, string> = {
  "post-images": "posts/images",
  "post-videos": "posts/videos",
  "fit-images": "fits",
  avatars: "avatars",
};

export async function POST(request: NextRequest) {
  try {
    // ── Auth check (Firebase ID token from Authorization header) ──
    const user = await getVerifiedUser(request);

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Parse body ──
    const { bucket, fileName, contentType, fileSize } = await request.json();

    if (!bucket || !fileName || !contentType) {
      return NextResponse.json(
        { error: "Missing bucket, fileName, or contentType" },
        { status: 400 }
      );
    }

    if (!BUCKET_FOLDER[bucket]) {
      return NextResponse.json(
        { error: `Invalid bucket: ${bucket}` },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.has(contentType)) {
      return NextResponse.json(
        { error: `Unsupported file type: ${contentType}` },
        { status: 400 }
      );
    }

    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large (max 50 MB)" },
        { status: 400 }
      );
    }

    // ── Build S3 key ──
    const folder = BUCKET_FOLDER[bucket];
    const ext = fileName.split(".").pop() || "bin";
    const key = `${folder}/${user.uid}/${crypto.randomUUID()}.${ext}`;

    // ── Generate presigned URL ──
    const { uploadUrl, publicUrl } = await createPresignedUploadUrl(
      key,
      contentType
    );

    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (error) {
    console.error("UPLOAD ROUTE ERROR:", error);
    const detail =
      error instanceof Error && error.message.startsWith("Server auth is not configured")
        ? error.message
        : process.env.NODE_ENV !== "production" && error instanceof Error
          ? error.message
          : undefined;
    return NextResponse.json(
      { error: "Internal server error", ...(detail ? { detail } : {}) },
      { status: 500 }
    );
  }
}

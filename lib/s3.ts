import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const s3 = new S3Client({
  region: process.env.AWS_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.S3_BUCKET_NAME!;
const CF_DOMAIN = process.env.CLOUDFRONT_DOMAIN!;

/**
 * Generate a presigned upload URL for a file.
 * Returns the URL the client should PUT to, and the final public URL
 * that will be stored in the database.
 */
export async function createPresignedUploadUrl(
  key: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
    // Cache browser images for 30 days, videos for 7 days
    CacheControl: key.match(/\.(mp4|webm|mov)$/i)
      ? "public, max-age=604800"
      : "public, max-age=2592000",
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min

  // The public URL goes through CloudFront
  const publicUrl = `https://${CF_DOMAIN}/${key}`;

  return { uploadUrl, publicUrl };
}

/**
 * Build a CloudFront URL for an existing key.
 * Useful for migrating old Supabase URLs to CloudFront.
 */
export function getCloudFrontUrl(key: string): string {
  return `https://${CF_DOMAIN}/${key}`;
}

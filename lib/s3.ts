import type { S3Client } from "@aws-sdk/client-s3";

// Lazily-created singleton — importing this module must not touch the AWS SDK
// so that bundling issues or missing env vars can't crash route modules at load.
let cachedClient: S3Client | null = null;

async function getS3Client(): Promise<S3Client> {
  if (cachedClient) return cachedClient;

  const { S3Client } = await import("@aws-sdk/client-s3");

  const region = process.env.AWS_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "S3 is not configured: AWS_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set in this environment."
    );
  }

  cachedClient = new S3Client({
    region,
    credentials: { accessKeyId, secretAccessKey },
  });
  return cachedClient;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`S3 is not configured: ${name} must be set in this environment.`);
  }
  return value;
}

/**
 * Generate a presigned upload URL for a file.
 * Returns the URL the client should PUT to, and the final public URL
 * that will be stored in the database.
 */
export async function createPresignedUploadUrl(
  key: string,
  contentType: string
): Promise<{ uploadUrl: string; publicUrl: string }> {
  const [{ PutObjectCommand }, { getSignedUrl }, s3] = await Promise.all([
    import("@aws-sdk/client-s3"),
    import("@aws-sdk/s3-request-presigner"),
    getS3Client(),
  ]);

  const bucket = requireEnv("S3_BUCKET_NAME");
  const cfDomain = requireEnv("CLOUDFRONT_DOMAIN");

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
    // Cache browser images for 30 days, videos for 7 days
    CacheControl: key.match(/\.(mp4|webm|mov)$/i)
      ? "public, max-age=604800"
      : "public, max-age=2592000",
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 min

  // The public URL goes through CloudFront
  const publicUrl = `https://${cfDomain}/${key}`;

  return { uploadUrl, publicUrl };
}

/**
 * Build a CloudFront URL for an existing key.
 * Useful for migrating old Supabase URLs to CloudFront.
 */
export function getCloudFrontUrl(key: string): string {
  return `https://${requireEnv("CLOUDFRONT_DOMAIN")}/${key}`;
}

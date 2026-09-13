import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // These packages use Node APIs that break when bundled for serverless.
  // Let Next load them from node_modules at runtime instead.
  serverExternalPackages: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "xgcdnpioxaingqvmygvy.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;

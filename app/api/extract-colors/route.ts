import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

/**
 * POST /api/extract-colors
 * Body: { imageUrl: string, count?: number }
 * Returns: { colors: string[] } — array of hex color strings
 */
export async function POST(req: NextRequest) {
  try {
    const { imageUrl, count = 3 } = await req.json();

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json(
        { error: "imageUrl is required" },
        { status: 400 }
      );
    }

    // Fetch the image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch image" },
        { status: 402 }
      );
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Resize to small thumbnail for fast processing
    const { data, info } = await sharp(buffer)
      .resize(64, 64, { fit: "cover" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Simple color quantization: divide pixels into buckets
    const pixelCount = info.width * info.height;
    const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};
    const bucketSize = 32; // quantize to 32 levels per channel

    for (let i = 0; i < data.length; i += 3) {
      const r = Math.round(data[i] / bucketSize) * bucketSize;
      const g = Math.round(data[i + 1] / bucketSize) * bucketSize;
      const b = Math.round(data[i + 2] / bucketSize) * bucketSize;
      const key = `${r}-${g}-${b}`;

      if (!buckets[key]) {
        buckets[key] = { r, g, b, count: 0 };
      }
      buckets[key].count++;
    }

    // Sort by frequency, pick top N
    const sorted = Object.values(buckets)
      .sort((a, b) => b.count - a.count)
      .slice(0, count + 2); // get extras to filter

    // Filter out very dark and very light colors (likely background)
    const filtered = sorted.filter((c) => {
      const brightness = (c.r + c.g + c.b) / 3;
      return brightness > 30 && brightness < 230;
    });

    // Take top N from filtered, fall back to unfiltered
    const top = filtered.length >= count ? filtered.slice(0, count) : sorted.slice(0, count);

    const colors = top.map((c) => {
      const hex = [c.r, c.g, c.b]
        .map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, "0"))
        .join("");
      return `#${hex}`;
    });

    return NextResponse.json({ colors });
  } catch (err: any) {
    console.error("❌ EXTRACT COLORS ERROR:", err?.message || err);
    return NextResponse.json(
      { error: "Failed to extract colors" },
      { status: 500 }
    );
  }
}

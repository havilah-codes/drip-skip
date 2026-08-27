import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

/** Convert RGB to HSL */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return [h * 360, s * 100, l * 100];
}

/** Hue distance (0–180) */
function hueDistance(h1: number, h2: number): number {
  const d = Math.abs(h1 - h2);
  return Math.min(d, 360 - d);
}

interface ColorBucket {
  r: number; g: number; b: number;
  count: number;
  h: number; s: number; l: number;
}

/**
 * POST /api/extract-colors
 * Body: { imageUrl: string, count?: number }
 * Returns: { colors: string[] } — array of hex color strings
 *
 * Uses frequency + hue diversity to pick visually distinct colors.
 */
export async function POST(req: NextRequest) {
  try {
    const { imageUrl, count = 3 } = await req.json();

    if (!imageUrl || typeof imageUrl !== "string") {
      return NextResponse.json({ error: "imageUrl is required" }, { status: 400 });
    }

    const response = await fetch(imageUrl);
    if (!response.ok) {
      return NextResponse.json({ error: "Failed to fetch image" }, { status: 402 });
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    // Resize to small thumbnail
    const { data } = await sharp(buffer)
      .resize(64, 64, { fit: "cover" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Bucket pixels with finer granularity
    const bucketSize = 16;
    const buckets: Record<string, ColorBucket> = {};

    for (let i = 0; i < data.length; i += 3) {
      const r = Math.round(data[i] / bucketSize) * bucketSize;
      const g = Math.round(data[i + 1] / bucketSize) * bucketSize;
      const b = Math.round(data[i + 2] / bucketSize) * bucketSize;
      const [h, s, l] = rgbToHsl(r, g, b);
      const key = `${r}-${g}-${b}`;

      if (!buckets[key]) {
        buckets[key] = { r, g, b, count: 0, h, s, l };
      }
      buckets[key].count++;
    }

    const allBuckets = Object.values(buckets)
      .sort((a, b) => b.count - a.count);

    // Filter: skip near-black, near-white, and very desaturated mid-grays
    const usable = allBuckets.filter((c) => {
      const brightness = (c.r + c.g + c.b) / 3;
      if (brightness < 40 || brightness > 220) return false;
      if (c.s < 10 && brightness > 80 && brightness < 180) return false; // gray
      return true;
    });

    // Select colors with hue diversity
    const selected: ColorBucket[] = [];
    const minHueGap = 30; // minimum hue distance between selected colors

    for (const candidate of usable) {
      if (selected.length >= count) break;

      // Check hue distance from already-selected colors
      const tooClose = selected.some(
        (s) => hueDistance(s.h, candidate.h) < minHueGap && Math.abs(s.l - candidate.l) < 20
      );

      if (!tooClose) {
        selected.push(candidate);
      }
    }

    // If we didn't get enough diverse colors, relax the constraint
    if (selected.length < count) {
      for (const candidate of usable) {
        if (selected.length >= count) break;
        if (!selected.includes(candidate)) {
          selected.push(candidate);
        }
      }
    }

    const colors = selected.slice(0, count).map((c) => {
      const hex = [c.r, c.g, c.b]
        .map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, "0"))
        .join("");
      return `#${hex}`;
    });

    return NextResponse.json({ colors });
  } catch (err: any) {
    console.error("❌ EXTRACT COLORS ERROR:", err?.message || err);
    return NextResponse.json({ error: "Failed to extract colors" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

/**
 * POST /api/migrate-colors
 * One-time endpoint: extracts dominant colors for all profiles with avatars
 * but no stored dominant_colors. Run once, then you can remove this route.
 */
export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Find profiles with avatars but no stored colors
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("id, avatar_url")
      .not("avatar_url", "is", null)
      .or("dominant_colors.is.null,dominant_colors.eq.");

    if (error) throw error;

    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ message: "No profiles to process", processed: 0 });
    }

    let processed = 0;
    let failed = 0;

    for (const profile of profiles) {
      if (!profile.avatar_url) continue;

      try {
        // Fetch image
        const response = await fetch(profile.avatar_url);
        if (!response.ok) {
          failed++;
          continue;
        }

        const buffer = Buffer.from(await response.arrayBuffer());

        // Extract colors using Sharp
        const { data: pixelData, info } = await sharp(buffer)
          .resize(64, 64, { fit: "cover" })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const bucketSize = 32;
        const buckets: Record<string, { r: number; g: number; b: number; count: number }> = {};

        for (let i = 0; i < pixelData.length; i += 3) {
          const r = Math.round(pixelData[i] / bucketSize) * bucketSize;
          const g = Math.round(pixelData[i + 1] / bucketSize) * bucketSize;
          const b = Math.round(pixelData[i + 2] / bucketSize) * bucketSize;
          const key = `${r}-${g}-${b}`;
          if (!buckets[key]) buckets[key] = { r, g, b, count: 0 };
          buckets[key].count++;
        }

        const sorted = Object.values(buckets)
          .sort((a, b) => b.count - a.count)
          .filter((c) => {
            const brightness = (c.r + c.g + c.b) / 3;
            return brightness > 30 && brightness < 230;
          })
          .slice(0, 3);

        if (sorted.length === 0) {
          failed++;
          continue;
        }

        const colors = sorted.map((c) => {
          const hex = [c.r, c.g, c.b]
            .map((v) => Math.min(255, Math.max(0, v)).toString(16).padStart(2, "0"))
            .join("");
          return `#${hex}`;
        });

        // Store in profile
        const { error: updateError } = await supabaseAdmin
          .from("profiles")
          .update({ dominant_colors: JSON.stringify(colors) })
          .eq("id", profile.id);

        if (updateError) {
          console.error(`❌ Failed to update profile ${profile.id}:`, updateError.message);
          failed++;
        } else {
          processed++;
          console.log(`✅ ${profile.id}: ${colors.join(", ")}`);
        }
      } catch (err: any) {
        console.error(`❌ Failed to process profile ${profile.id}:`, err?.message);
        failed++;
      }
    }

    return NextResponse.json({
      message: "Migration complete",
      processed,
      failed,
      total: profiles.length,
    });
  } catch (err: any) {
    console.error("❌ MIGRATION ERROR:", err?.message || err);
    return NextResponse.json({ error: "Migration failed" }, { status: 500 });
  }
}

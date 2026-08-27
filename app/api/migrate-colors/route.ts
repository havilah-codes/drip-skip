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

        // Extract colors using Sharp with hue diversity
        const { data: pixelData } = await sharp(buffer)
          .resize(64, 64, { fit: "cover" })
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });

        // RGB to HSL helper
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
        function hueDist(a: number, b: number) { return Math.min(Math.abs(a - b), 360 - Math.abs(a - b)); }

        const bucketSize = 16;
        const buckets: Record<string, { r: number; g: number; b: number; count: number; h: number; s: number; l: number }> = {};

        for (let i = 0; i < pixelData.length; i += 3) {
          const r = Math.round(pixelData[i] / bucketSize) * bucketSize;
          const g = Math.round(pixelData[i + 1] / bucketSize) * bucketSize;
          const b = Math.round(pixelData[i + 2] / bucketSize) * bucketSize;
          const [h, s, l] = rgbToHsl(r, g, b);
          const key = `${r}-${g}-${b}`;
          if (!buckets[key]) buckets[key] = { r, g, b, count: 0, h, s, l };
          buckets[key].count++;
        }

        const usable = Object.values(buckets)
          .sort((a, b) => b.count - a.count)
          .filter((c) => {
            const brightness = (c.r + c.g + c.b) / 3;
            if (brightness < 40 || brightness > 220) return false;
            if (c.s < 10 && brightness > 80 && brightness < 180) return false;
            return true;
          });

        // Select with hue diversity
        const selected: typeof usable = [];
        for (const c of usable) {
          if (selected.length >= 3) break;
          const tooClose = selected.some(
            (s) => hueDist(s.h, c.h) < 30 && Math.abs(s.l - c.l) < 20
          );
          if (!tooClose) selected.push(c);
        }
        if (selected.length < 3) {
          for (const c of usable) {
            if (selected.length >= 3) break;
            if (!selected.includes(c)) selected.push(c);
          }
        }

        if (selected.length === 0) {
          failed++;
          continue;
        }

        const colors = selected.slice(0, 3).map((c) => {
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

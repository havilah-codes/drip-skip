import { supabase } from "@/lib/supabase";

/**
 * Extract hashtags from text. Returns lowercase names without the #.
 * e.g. "Love this #StreetWear #OOTD!!!" → ["streetwear", "ootd"]
 */
export function extractHashtags(text: string): string[] {
  const matches = text.match(/#[\w\u00C0-\u024F]+/gi);
  if (!matches) return [];

  const unique = new Set(
    matches.map((tag) => tag.slice(1).toLowerCase())
  );
  return Array.from(unique);
}

/**
 * Find or create hashtags and link them to a post.
 * Called server-side after a post is inserted.
 */
export async function linkHashtagsToPost(
  postId: string,
  text: string
): Promise<void> {
  const tagNames = extractHashtags(text);
  if (tagNames.length === 0) return;

  // Upsert each hashtag
  const hashtagIds: string[] = [];

  for (const name of tagNames) {
    // Try to find existing
    const { data: existing } = await supabase
      .from("hashtags")
      .select("id")
      .eq("name", name)
      .single();

    if (existing) {
      hashtagIds.push(existing.id);
    } else {
      // Insert new
      const { data: inserted } = await supabase
        .from("hashtags")
        .insert({ name })
        .select("id")
        .single();

      if (inserted) {
        hashtagIds.push(inserted.id);
      }
    }
  }

  // Link to post (ignore duplicates)
  if (hashtagIds.length > 0) {
    const rows = hashtagIds.map((hashtag_id) => ({
      post_id: postId,
      hashtag_id,
    }));

    await supabase.from("post_hashtags").upsert(rows, {
      onConflict: "post_id,hashtag_id",
      ignoreDuplicates: true,
    });
  }
}

import { supabase } from "@/lib/supabase";
import { extractHashtags } from "@/lib/hashtags";

/**
 * After a post is created, check if any of its hashtags match an active
 * challenge's theme. If so, automatically register the post as an entry.
 */
export async function autoRegisterChallengeEntry(
  postId: string,
  postUserId: string,
  text: string
): Promise<void> {
  const hashtags = extractHashtags(text);
  if (hashtags.length === 0) return;

  try {
    // Find active challenges whose theme matches any of the post's hashtags
    const { data: challenges } = await supabase
      .from("challenges")
      .select("id, theme")
      .eq("status", "active")
      .in("theme", hashtags);

    if (!challenges || challenges.length === 0) return;

    // Insert challenge entry for each matching challenge
    for (const challenge of challenges) {
      const { error } = await supabase.from("challenge_entries").upsert(
        {
          challenge_id: challenge.id,
          user_id: postUserId,
          post_id: postId,
        },
        { onConflict: "challenge_id,user_id", ignoreDuplicates: true }
      );

      if (error) {
        console.error(
          `Failed to register entry for challenge ${challenge.id}:`,
          error
        );
      } else {
        console.log(
          `✅ Auto-registered post ${postId} as entry for challenge "${challenge.theme}"`
        );
      }
    }
  } catch (err) {
    console.error("Auto challenge entry registration failed:", err);
  }
}

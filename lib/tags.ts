import { supabase } from "./supabase";

/**
 * Extract @mentions from text.
 * Matches @username where username is alphanumeric + underscores.
 */
export function extractMentions(text: string): string[] {
  const mentionRegex = /@([a-zA-Z0-9_]+)/g;
  const mentions: string[] = [];
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    const username = match[1].toLowerCase();
    if (!mentions.includes(username)) {
      mentions.push(username);
    }
  }

  return mentions;
}

/**
 * Resolve usernames to user IDs and save tags to the database.
 * Returns the list of tagged user IDs.
 */
export async function savePostTags(
  postId: string,
  text: string,
  currentUserId: string
): Promise<string[]> {
  const usernames = extractMentions(text);

  if (usernames.length === 0) return [];

  // Look up user IDs for the mentioned usernames
  const { data: profiles, error: lookupError } = await supabase
    .from("profiles")
    .select("id, username")
    .in("username", usernames);

  if (lookupError || !profiles || profiles.length === 0) {
    console.error("❌ TAG LOOKUP FAILED:", lookupError);
    return [];
  }

  // Filter out self-mentions and duplicates
  const taggedUserIds = profiles
    .filter((p) => p.id !== currentUserId)
    .map((p) => p.id);

  if (taggedUserIds.length === 0) return [];

  // Insert tags
  const tags = taggedUserIds.map((userId) => ({
    post_id: postId,
    tagged_user_id: userId,
  }));

  const { error: insertError } = await supabase.from("post_tags").insert(tags);

  if (insertError) {
    console.error("❌ TAG INSERT FAILED:", insertError);
    return [];
  }

  return taggedUserIds;
}

/**
 * Get all users tagged in a post.
 */
export async function getPostTags(postId: string) {
  const { data, error } = await supabase
    .from("post_tags")
    .select(`
      tagged_user_id,
      profiles (
        id,
        username,
        display_name,
        avatar_url
      )
    `)
    .eq("post_id", postId);

  if (error || !data) return [];

  return data.map((tag) => {
    const profile = Array.isArray(tag.profiles)
      ? tag.profiles[0]
      : tag.profiles;
    return {
      userId: tag.tagged_user_id,
      username: profile?.username || "",
      displayName: profile?.display_name || "",
    };
  });
}

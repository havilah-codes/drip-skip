import { supabase } from "@/lib/supabase";

export type SmartFeedPost = {
  id: string;
  user_id: string;
  text: string | null;
  image_url: string | null;
  video_url: string | null;
  created_at: string;
  profiles: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  } | null;
  drip_count: number;
  skip_count: number;
  feed_score: number;
};

type GetSmartFeedOptions = {
  profileId: string;
  limit?: number;
};

export async function getSmartFeed({
  profileId,
  limit = 50,
}: GetSmartFeedOptions): Promise<SmartFeedPost[]> {
  console.log("🧠 SMART FEED STARTED");
  console.log("👤 PROFILE ID:", profileId);

  try {
    // ==========================================
    // 1. FETCH FOLLOWING LIST & USER'S VOTED POSTS (PARALLEL)
    // ==========================================
    const [followsRes, userVotesRes] = await Promise.all([
      supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", profileId),
      supabase
        .from("votes")
        .select("fit_id")
        .eq("user_id", profileId),
    ]);

    if (followsRes.error) {
      console.error("❌ SMART FEED FOLLOW ERROR:", followsRes.error);
      throw followsRes.error;
    }

    if (userVotesRes.error) {
      console.error("❌ SMART FEED USER VOTES ERROR:", userVotesRes.error);
      throw userVotesRes.error;
    }

    const followingIds = new Set(
      followsRes.data?.map((f) => f.following_id) || []
    );
    const alreadyVotedSet = new Set(
      userVotesRes.data?.map((v) => v.fit_id) || []
    );

    console.log("👥 FOLLOWING COUNT:", followingIds.size);
    console.log("🗳️ ALREADY VOTED COUNT:", alreadyVotedSet.size);

    // ==========================================
    // 2. FETCH CANDIDATE POSTS
    // ==========================================
    const { data: postsData, error: postsError } = await supabase
      .from("posts")
      .select(`
        id,
        user_id,
        text,
        image_url,
        video_url,
        created_at,
        profiles (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .neq("user_id", profileId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (postsError) {
      console.error("❌ SMART FEED POSTS ERROR:", postsError);
      throw postsError;
    }

    if (!postsData || postsData.length === 0) {
      return [];
    }

    // Filter out posts already voted on by this user
    const candidatePosts = postsData.filter(
      (post) => !alreadyVotedSet.has(post.id)
    );

    console.log("📦 CANDIDATE POSTS:", candidatePosts.length);

    if (candidatePosts.length === 0) {
      return [];
    }

    const candidatePostIds = candidatePosts.map((p) => p.id);

    // ==========================================
    // 3. FETCH VOTES ONLY FOR CANDIDATE POSTS
    // ==========================================
    const { data: candidateVotes, error: candidateVotesError } = await supabase
      .from("votes")
      .select("fit_id, vote")
      .in("fit_id", candidatePostIds);

    if (candidateVotesError) {
      console.error("❌ SMART FEED CANDIDATE VOTES ERROR:", candidateVotesError);
      throw candidateVotesError;
    }

    // Map votes to post IDs
    const voteStats: Record<string, { drip: number; skip: number }> = {};

    candidateVotes?.forEach((v) => {
      if (!voteStats[v.fit_id]) {
        voteStats[v.fit_id] = { drip: 0, skip: 0 };
      }
      if (v.vote === "drip") voteStats[v.fit_id].drip++;
      if (v.vote === "skip") voteStats[v.fit_id].skip++;
    });

    // ==========================================
    // 4. SCORE & RANK CANDIDATES
    // ==========================================
    const now = Date.now();

    const scoredPosts: SmartFeedPost[] = candidatePosts.map((post) => {
      const stats = voteStats[post.id] || { drip: 0, skip: 0 };
      const isFollowing = followingIds.has(post.user_id);

      // --- RECENCY SCORE (Max 20 pts) ---
      const ageHours = Math.max(
        0,
        (now - new Date(post.created_at).getTime()) / (1000 * 60 * 60)
      );
      const recencyScore = Math.max(0, 20 - ageHours * 0.5);

      // --- ENGAGEMENT SCORE (Max 20 pts) ---
      const totalVotes = stats.drip + stats.skip;
      const engagementScore = Math.min(totalVotes * 1.5, 20);

      // --- COMMUNITY REACTION SCORE (-15 to +15 pts) ---
      let reactionScore = 0;
      if (totalVotes > 0) {
        const dripRatio = stats.drip / totalVotes;
        // High drip ratio boosts score; high skip ratio penalizes score
        reactionScore = (dripRatio - 0.5) * 30;
      }

      // --- FOLLOWING BOOST (50 pts) ---
      const followingScore = isFollowing ? 50 : 0;

      // --- FINAL AGGREGATE SCORE ---
      const feedScore =
        followingScore + recencyScore + engagementScore + reactionScore;

      // Normalize profile response shape
      const profileObj = Array.isArray(post.profiles)
        ? post.profiles[0] || null
        : post.profiles;

      return {
        id: post.id,
        user_id: post.user_id,
        text: post.text,
        image_url: post.image_url,
        video_url: post.video_url,
        created_at: post.created_at,
        profiles: profileObj,
        drip_count: stats.drip,
        skip_count: stats.skip,
        feed_score: feedScore,
      };
    });

    // Sort descending by score
    scoredPosts.sort((a, b) => b.feed_score - a.feed_score);

    const result = scoredPosts.slice(0, limit);

    console.log(
      "🧠 SMART FEED RESULT COUNT:",
      result.length
    );

    return result;
  } catch (error) {
    console.error("❌ SMART FEED FAILED:", error);
    throw error;
  }
}
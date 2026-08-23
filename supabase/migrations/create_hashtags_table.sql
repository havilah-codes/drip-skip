-- Hashtags table
CREATE TABLE IF NOT EXISTS hashtags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Junction table linking posts to hashtags
CREATE TABLE IF NOT EXISTS post_hashtags (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id UUID NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (post_id, hashtag_id)
);

-- RLS policies
ALTER TABLE hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_hashtags ENABLE ROW LEVEL SECURITY;

-- Anyone can read hashtags
CREATE POLICY "Hashtags are viewable by everyone"
  ON hashtags FOR SELECT
  USING (true);

-- System can insert hashtags (via service role)
CREATE POLICY "Service role can insert hashtags"
  ON hashtags FOR INSERT
  WITH CHECK (true);

-- Anyone can read post_hashtags
CREATE POLICY "Post hashtags are viewable by everyone"
  ON post_hashtags FOR SELECT
  USING (true);

-- System can insert post_hashtags (via service role)
CREATE POLICY "Service role can insert post_hashtags"
  ON post_hashtags FOR INSERT
  WITH CHECK (true);

-- System can delete post_hashtags on post delete (handled by CASCADE)

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hashtags_name ON hashtags(name);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_post_id ON post_hashtags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_hashtags_hashtag_id ON post_hashtags(hashtag_id);

-- Function to get trending hashtags (last 7 days)
CREATE OR REPLACE FUNCTION get_trending_hashtags(limit_count INT DEFAULT 20)
RETURNS TABLE (
  id UUID,
  name TEXT,
  post_count BIGINT
)
LANGUAGE sql STABLE
AS $$
  SELECT h.id, h.name, COUNT(ph.post_id) AS post_count
  FROM hashtags h
  JOIN post_hashtags ph ON ph.hashtag_id = h.id
  JOIN posts p ON p.id = ph.post_id
  WHERE p.created_at > NOW() - INTERVAL '7 days'
  GROUP BY h.id, h.name
  ORDER BY post_count DESC
  LIMIT limit_count;
$$;

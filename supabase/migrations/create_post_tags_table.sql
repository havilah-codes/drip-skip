-- ==========================================
-- POST TAGS (User Mentions)
-- ==========================================

CREATE TABLE IF NOT EXISTS post_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tagged_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, tagged_user_id)
);

-- RLS
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;

-- Everyone can read tags
DROP POLICY IF EXISTS "Tags are viewable by everyone" ON post_tags;
CREATE POLICY "Tags are viewable by everyone" ON post_tags
  FOR SELECT USING (true);

-- Anyone can insert tags (auth handled client-side via Firebase)
DROP POLICY IF EXISTS "Users can tag in posts" ON post_tags;
CREATE POLICY "Users can tag in posts" ON post_tags
  FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX IF NOT EXISTS idx_post_tags_user_id ON post_tags(tagged_user_id);

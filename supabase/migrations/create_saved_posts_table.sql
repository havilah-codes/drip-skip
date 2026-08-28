-- ==========================================
-- SAVED POSTS (Bookmarks)
-- ==========================================

CREATE TABLE IF NOT EXISTS saved_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, post_id)
);

-- RLS
ALTER TABLE saved_posts ENABLE ROW LEVEL SECURITY;

-- Everyone can read their own saved posts
DROP POLICY IF EXISTS "Users can view their own saved posts" ON saved_posts;
CREATE POLICY "Users can view their own saved posts" ON saved_posts
  FOR SELECT USING (true);

-- Anyone can insert (auth handled client-side via Firebase)
DROP POLICY IF EXISTS "Users can save posts" ON saved_posts;
CREATE POLICY "Users can save posts" ON saved_posts
  FOR INSERT WITH CHECK (true);

-- Anyone can delete (auth handled client-side via Firebase)
DROP POLICY IF EXISTS "Users can unsave posts" ON saved_posts;
CREATE POLICY "Users can unsave posts" ON saved_posts
  FOR DELETE USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_posts_user_id ON saved_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_posts_post_id ON saved_posts(post_id);
CREATE INDEX IF NOT EXISTS idx_saved_posts_created ON saved_posts(created_at DESC);

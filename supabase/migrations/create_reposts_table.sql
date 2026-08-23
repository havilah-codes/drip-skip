-- Reposts table
CREATE TABLE IF NOT EXISTS reposts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, post_id)
);

-- RLS policies
ALTER TABLE reposts ENABLE ROW LEVEL SECURITY;

-- Anyone can read reposts
CREATE POLICY "Reposts are viewable by everyone"
  ON reposts FOR SELECT
  USING (true);

-- Users can insert their own reposts
CREATE POLICY "Users can insert their own reposts"
  ON reposts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own reposts
CREATE POLICY "Users can delete their own reposts"
  ON reposts FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reposts_post_id ON reposts(post_id);
CREATE INDEX IF NOT EXISTS idx_reposts_user_id ON reposts(user_id);
CREATE INDEX IF NOT EXISTS idx_reposts_created_at ON reposts(created_at DESC);

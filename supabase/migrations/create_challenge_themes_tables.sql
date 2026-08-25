-- ==========================================
-- USER-DRIVEN CHALLENGE THEMES
-- Let the community decide what trends to feature
-- ==========================================

CREATE TABLE IF NOT EXISTS challenge_themes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'active')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(title)
);

CREATE TABLE IF NOT EXISTS theme_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  theme_id UUID NOT NULL REFERENCES challenge_themes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('up', 'down')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(theme_id, user_id)
);

-- ==========================================
-- RLS POLICIES (drop existing first to be idempotent)
-- ==========================================

ALTER TABLE challenge_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE theme_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Themes are viewable by everyone" ON challenge_themes;
DROP POLICY IF EXISTS "Theme votes are viewable by everyone" ON theme_votes;
DROP POLICY IF EXISTS "Anyone can submit themes" ON challenge_themes;
DROP POLICY IF EXISTS "Anyone can vote on themes" ON theme_votes;
DROP POLICY IF EXISTS "Anyone can update votes" ON theme_votes;
DROP POLICY IF EXISTS "Anyone can delete votes" ON theme_votes;
DROP POLICY IF EXISTS "Anyone can delete themes" ON challenge_themes;

CREATE POLICY "Themes are viewable by everyone" ON challenge_themes FOR SELECT USING (true);
CREATE POLICY "Theme votes are viewable by everyone" ON theme_votes FOR SELECT USING (true);
CREATE POLICY "Anyone can submit themes" ON challenge_themes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can vote on themes" ON theme_votes FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update votes" ON theme_votes FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete votes" ON theme_votes FOR DELETE USING (true);
CREATE POLICY "Anyone can delete themes" ON challenge_themes FOR DELETE USING (true);

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_challenge_themes_status ON challenge_themes(status);
CREATE INDEX IF NOT EXISTS idx_challenge_themes_created ON challenge_themes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_theme_votes_theme_id ON theme_votes(theme_id);
CREATE INDEX IF NOT EXISTS idx_theme_votes_user_id ON theme_votes(user_id);

-- ==========================================
-- VIEW: Trending themes with vote counts
-- ==========================================

CREATE OR REPLACE VIEW trending_themes AS
SELECT
  t.*,
  p.username,
  p.display_name,
  p.avatar_url,
  COUNT(CASE WHEN v.vote = 'up' THEN 1 END) AS upvotes,
  COUNT(CASE WHEN v.vote = 'down' THEN 1 END) AS downvotes,
  COUNT(CASE WHEN v.vote = 'up' THEN 1 END) - COUNT(CASE WHEN v.vote = 'down' THEN 1 END) AS score
FROM challenge_themes t
JOIN profiles p ON p.id = t.user_id
LEFT JOIN theme_votes v ON v.theme_id = t.id
WHERE t.status IN ('pending', 'approved')
GROUP BY t.id, p.username, p.display_name, p.avatar_url
ORDER BY score DESC, t.created_at DESC;

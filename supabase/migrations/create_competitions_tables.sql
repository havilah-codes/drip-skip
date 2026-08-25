-- ==========================================
-- FIT BATTLES
-- Head-to-head matchups between two posts
-- ==========================================

CREATE TABLE IF NOT EXISTS battles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_a_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  post_b_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  winner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '24 hours'),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_a_id, post_b_id)
);

CREATE TABLE IF NOT EXISTS battle_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  battle_id UUID NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chosen_post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(battle_id, user_id)
);

-- ==========================================
-- FIT CHALLENGES
-- Themed weekly contests
-- ==========================================

CREATE TABLE IF NOT EXISTS challenges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  theme TEXT NOT NULL,
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('upcoming', 'active', 'completed')),
  starts_at TIMESTAMPTZ DEFAULT now(),
  ends_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS challenge_entries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(challenge_id, user_id)
);

CREATE TABLE IF NOT EXISTS challenge_votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES challenge_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  vote TEXT NOT NULL CHECK (vote IN ('drip', 'skip')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entry_id, user_id)
);

-- ==========================================
-- WEEKLY LEADERBOARDS (materialized view)
-- Refreshed periodically via cron or trigger
-- ==========================================

CREATE TABLE IF NOT EXISTS weekly_leaderboards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  drip_count INTEGER NOT NULL DEFAULT 0,
  skip_count INTEGER NOT NULL DEFAULT 0,
  post_count INTEGER NOT NULL DEFAULT 0,
  drip_ratio NUMERIC(5,4) NOT NULL DEFAULT 0,
  rank INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, week_start)
);

-- ==========================================
-- RLS POLICIES
-- ==========================================

ALTER TABLE battles ENABLE ROW LEVEL SECURITY;
ALTER TABLE battle_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_leaderboards ENABLE ROW LEVEL SECURITY;

-- Battles: everyone can read
CREATE POLICY "Battles are viewable by everyone" ON battles FOR SELECT USING (true);
CREATE POLICY "Battle votes are viewable by everyone" ON battle_votes FOR SELECT USING (true);

-- Challenges: everyone can read
CREATE POLICY "Challenges are viewable by everyone" ON challenges FOR SELECT USING (true);
CREATE POLICY "Challenge entries are viewable by everyone" ON challenge_entries FOR SELECT USING (true);
CREATE POLICY "Challenge votes are viewable by everyone" ON challenge_votes FOR SELECT USING (true);

-- Leaderboards: everyone can read
CREATE POLICY "Leaderboards are viewable by everyone" ON weekly_leaderboards FOR SELECT USING (true);

-- Authenticated users can vote on battles
CREATE POLICY "Authenticated users can vote on battles" ON battle_votes FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT firebase_uid FROM profiles WHERE id = user_id));

-- Authenticated users can submit entries
CREATE POLICY "Authenticated users can submit challenge entries" ON challenge_entries FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT firebase_uid FROM profiles WHERE id = user_id));

-- Authenticated users can vote on challenges
CREATE POLICY "Authenticated users can vote on challenges" ON challenge_votes FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT firebase_uid FROM profiles WHERE id = user_id));

-- ==========================================
-- INDEXES
-- ==========================================

CREATE INDEX IF NOT EXISTS idx_battles_status ON battles(status);
CREATE INDEX IF NOT EXISTS idx_battles_ends_at ON battles(ends_at DESC);
CREATE INDEX IF NOT EXISTS idx_battle_votes_battle_id ON battle_votes(battle_id);
CREATE INDEX IF NOT EXISTS idx_challenges_status ON challenges(status);
CREATE INDEX IF NOT EXISTS idx_challenges_ends_at ON challenges(ends_at DESC);
CREATE INDEX IF NOT EXISTS idx_challenge_entries_challenge_id ON challenge_entries(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_votes_entry_id ON challenge_votes(entry_id);
CREATE INDEX IF NOT EXISTS idx_weekly_leaderboards_week ON weekly_leaderboards(week_start DESC, rank ASC);

-- ==========================================
-- FUNCTIONS
-- ==========================================

-- Get current ISO week start (Monday)
CREATE OR REPLACE FUNCTION get_current_week_start()
RETURNS DATE
LANGUAGE SQL STABLE
AS $$
  SELECT date_trunc('week', NOW())::date;
$$;

-- Auto-complete battles past their end time
CREATE OR REPLACE FUNCTION complete_expired_battles()
RETURNS VOID
LANGUAGE PLPGSQL
AS $$
BEGIN
  UPDATE battles
  SET status = 'completed'
  WHERE status = 'active'
    AND ends_at < NOW();
END;
$$;

-- Refresh weekly leaderboard for current week
CREATE OR REPLACE FUNCTION refresh_weekly_leaderboard(target_week DATE DEFAULT NULL)
RETURNS VOID
LANGUAGE PLPGSQL
AS $$
DECLARE
  week_start DATE;
BEGIN
  week_start := COALESCE(target_week, get_current_week_start());

  -- Delete existing entries for this week
  DELETE FROM weekly_leaderboards WHERE week_start = week_start;

  -- Insert new rankings
  INSERT INTO weekly_leaderboards (user_id, week_start, drip_count, skip_count, post_count, drip_ratio, rank)
  WITH post_stats AS (
    SELECT
      p.user_id,
      COUNT(DISTINCT p.id) AS post_count
    FROM posts p
    WHERE p.created_at >= week_start::timestamptz
      AND p.created_at < (week_start + INTERVAL '7 days')::timestamptz
    GROUP BY p.user_id
  ),
  vote_stats AS (
    SELECT
      p.user_id,
      COUNT(CASE WHEN v.vote = 'drip' THEN 1 END) AS drip_count,
      COUNT(CASE WHEN v.vote = 'skip' THEN 1 END) AS skip_count
    FROM posts p
    JOIN votes v ON v.fit_id = p.id
    WHERE p.created_at >= week_start::timestamptz
      AND p.created_at < (week_start + INTERVAL '7 days')::timestamptz
    GROUP BY p.user_id
  ),
  combined AS (
    SELECT
      COALESCE(ps.user_id, vs.user_id) AS user_id,
      COALESCE(vs.drip_count, 0) AS drip_count,
      COALESCE(vs.skip_count, 0) AS skip_count,
      COALESCE(ps.post_count, 0) AS post_count,
      CASE
        WHEN COALESCE(vs.drip_count, 0) + COALESCE(vs.skip_count, 0) > 0
        THEN COALESCE(vs.drip_count, 0)::NUMERIC / (COALESCE(vs.drip_count, 0) + COALESCE(vs.skip_count, 0))
        ELSE 0
      END AS drip_ratio
    FROM post_stats ps
    FULL OUTER JOIN vote_stats vs ON ps.user_id = vs.user_id
  )
  SELECT
    c.user_id,
    week_start,
    c.drip_count,
    c.skip_count,
    c.post_count,
    c.drip_ratio,
    ROW_NUMBER() OVER (ORDER BY c.drip_count DESC, c.drip_ratio DESC, c.post_count DESC)::INTEGER AS rank
  FROM combined c;
END;
$$;

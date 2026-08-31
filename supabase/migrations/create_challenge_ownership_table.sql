-- Track challenge ownership with TEXT firebase_uid (not UUID)
CREATE TABLE IF NOT EXISTS challenge_ownership (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  firebase_uid TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(challenge_id)
);

ALTER TABLE challenge_ownership ENABLE ROW LEVEL SECURITY;

-- Everyone can read
CREATE POLICY "Challenge ownership is viewable by everyone" ON challenge_ownership FOR SELECT USING (true);

-- Owners can insert
CREATE POLICY "Users can claim ownership of their challenges" ON challenge_ownership FOR INSERT
  WITH CHECK (auth.uid()::text = firebase_uid);

-- Drop the old broken created_by column and its policies
DO $$
BEGIN
  BEGIN DROP POLICY IF EXISTS "Creators can update their own challenges" ON challenges; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "Creators can delete their own challenges" ON challenges; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "Authenticated users can create challenges" ON challenges; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TABLE challenges DROP COLUMN IF EXISTS created_by; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE INDEX IF NOT EXISTS idx_challenge_ownership_firebase_uid ON challenge_ownership(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_challenge_ownership_challenge_id ON challenge_ownership(challenge_id);

-- Add creator tracking to challenges for admin privileges
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id) ON DELETE SET NULL;

-- Add status management columns
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS entry_deadline TIMESTAMPTZ;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS voting_deadline TIMESTAMPTZ;
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS max_entries_per_user INTEGER DEFAULT 1;

-- Index for creator queries
CREATE INDEX IF NOT EXISTS idx_challenges_created_by ON challenges(created_by);

-- Update RLS policies for creator management
-- Creators can update their own challenges
CREATE POLICY "Creators can update their own challenges" ON challenges FOR UPDATE
  USING (auth.uid()::text = (SELECT firebase_uid FROM profiles WHERE id = created_by));

-- Creators can delete their own challenges
CREATE POLICY "Creators can delete their own challenges" ON challenges FOR DELETE
  USING (auth.uid()::text = (SELECT firebase_uid FROM profiles WHERE id = created_by));

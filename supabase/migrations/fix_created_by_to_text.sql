-- Fix challenges.created_by to accept Firebase UIDs (TEXT) instead of UUID
-- The profiles table uses firebase_uid as its identifier

-- Drop the old column and recreate as TEXT
ALTER TABLE challenges DROP COLUMN IF EXISTS created_by;
ALTER TABLE challenges ADD COLUMN created_by TEXT;

-- Update RLS policies for TEXT type
DROP POLICY IF EXISTS "Creators can update their own challenges" ON challenges;
DROP POLICY IF EXISTS "Creators can delete their own challenges" ON challenges;
DROP POLICY IF EXISTS "Authenticated users can create challenges" ON challenges;

CREATE POLICY "Authenticated users can create challenges" ON challenges FOR INSERT
  WITH CHECK (auth.uid()::text = created_by);

CREATE POLICY "Creators can update their own challenges" ON challenges FOR UPDATE
  USING (auth.uid()::text = created_by);

CREATE POLICY "Creators can delete their own challenges" ON challenges FOR DELETE
  USING (auth.uid()::text = created_by);

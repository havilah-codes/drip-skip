-- Run this SINGLE query in Supabase SQL Editor

-- Drop all dependent policies first
DROP POLICY IF EXISTS "Creators can update their own challenges" ON challenges;
DROP POLICY IF EXISTS "Creators can delete their own challenges" ON challenges;
DROP POLICY IF EXISTS "Authenticated users can create challenges" ON challenges;

-- Now safe to drop the column
ALTER TABLE challenges DROP COLUMN IF EXISTS created_by;

-- Add it back as TEXT
ALTER TABLE challenges ADD COLUMN created_by TEXT;

-- Recreate policies
CREATE POLICY "Authenticated users can create challenges" ON challenges FOR INSERT
  WITH CHECK (auth.uid()::text = created_by);

CREATE POLICY "Creators can update their own challenges" ON challenges FOR UPDATE
  USING (auth.uid()::text = created_by);

CREATE POLICY "Creators can delete their own challenges" ON challenges FOR DELETE
  USING (auth.uid()::text = created_by);

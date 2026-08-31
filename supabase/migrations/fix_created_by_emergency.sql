-- Run this in Supabase SQL Editor
-- This will fix the created_by column regardless of its current state

-- Step 1: Drop all policies that depend on created_by
DO $$ 
BEGIN
  -- Drop policies if they exist
  BEGIN DROP POLICY IF EXISTS "Creators can update their own challenges" ON challenges; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "Creators can delete their own challenges" ON challenges; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DROP POLICY IF EXISTS "Authenticated users can create challenges" ON challenges; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- Step 2: Drop the column
ALTER TABLE challenges DROP COLUMN IF EXISTS created_by;

-- Step 3: Add as TEXT (not UUID)
ALTER TABLE challenges ADD COLUMN created_by TEXT;

-- Step 4: Recreate policies
CREATE POLICY "Authenticated users can create challenges" ON challenges FOR INSERT
  WITH CHECK (auth.uid()::text = created_by);

CREATE POLICY "Creators can update their own challenges" ON challenges FOR UPDATE
  USING (auth.uid()::text = created_by);

CREATE POLICY "Creators can delete their own challenges" ON challenges FOR DELETE
  USING (auth.uid()::text = created_by);

-- Verify the column type
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'challenges' AND column_name = 'created_by';

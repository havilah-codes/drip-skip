-- Step 1: Drop dependent policies
DROP POLICY IF EXISTS "Creators can update their own challenges" ON challenges;
DROP POLICY IF EXISTS "Creators can delete their own challenges" ON challenges;
DROP POLICY IF EXISTS "Authenticated users can create challenges" ON challenges;

-- Step 2: Drop and recreate column as TEXT
ALTER TABLE challenges DROP COLUMN created_by;
ALTER TABLE challenges ADD COLUMN created_by TEXT;

-- Step 3: Recreate policies for TEXT type
CREATE POLICY "Authenticated users can create challenges" ON challenges FOR INSERT
  WITH CHECK (auth.uid()::text = created_by);

CREATE POLICY "Creators can update their own challenges" ON challenges FOR UPDATE
  USING (auth.uid()::text = created_by);

CREATE POLICY "Creators can delete their own challenges" ON challenges FOR DELETE
  USING (auth.uid()::text = created_by);

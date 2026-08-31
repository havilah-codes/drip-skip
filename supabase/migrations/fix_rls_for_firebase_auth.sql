-- Fix ALL RLS policies that use auth.uid() - doesn't work with Firebase Auth
-- auth.uid() returns NULL when using Firebase Auth instead of Supabase Auth

-- ============================================
-- Helper: Drop all policies on a table
-- ============================================
CREATE OR REPLACE FUNCTION drop_all_policies(target_table TEXT)
RETURNS VOID
LANGUAGE PLPGSQL
AS $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = target_table
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, target_table);
  END LOOP;
END;
$$;

-- ============================================
-- CHALLENGES
-- ============================================
SELECT drop_all_policies('challenges');
CREATE POLICY "Challenges: read" ON challenges FOR SELECT USING (true);
CREATE POLICY "Challenges: insert" ON challenges FOR INSERT WITH CHECK (true);
CREATE POLICY "Challenges: update" ON challenges FOR UPDATE USING (true);
CREATE POLICY "Challenges: delete" ON challenges FOR DELETE USING (true);

-- ============================================
-- CHALLENGE_OWNERSHIP
-- ============================================
SELECT drop_all_policies('challenge_ownership');
CREATE POLICY "Ownership: read" ON challenge_ownership FOR SELECT USING (true);
CREATE POLICY "Ownership: insert" ON challenge_ownership FOR INSERT WITH CHECK (true);

-- ============================================
-- CHALLENGE_ENTRIES
-- ============================================
SELECT drop_all_policies('challenge_entries');
CREATE POLICY "Entries: read" ON challenge_entries FOR SELECT USING (true);
CREATE POLICY "Entries: insert" ON challenge_entries FOR INSERT WITH CHECK (true);

-- ============================================
-- CHALLENGE_VOTES
-- ============================================
SELECT drop_all_policies('challenge_votes');
CREATE POLICY "Challenge votes: read" ON challenge_votes FOR SELECT USING (true);
CREATE POLICY "Challenge votes: insert" ON challenge_votes FOR INSERT WITH CHECK (true);

-- ============================================
-- BATTLE_VOTES
-- ============================================
SELECT drop_all_policies('battle_votes');
CREATE POLICY "Battle votes: read" ON battle_votes FOR SELECT USING (true);
CREATE POLICY "Battle votes: insert" ON battle_votes FOR INSERT WITH CHECK (true);

-- ============================================
-- REPOSTS (has auth.uid() = user_id)
-- ============================================
DO $$ BEGIN
  PERFORM drop_all_policies('reposts');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  CREATE POLICY "Reposts: read" ON reposts FOR SELECT USING (true);
  CREATE POLICY "Reposts: insert" ON reposts FOR INSERT WITH CHECK (true);
  CREATE POLICY "Reposts: delete" ON reposts FOR DELETE USING (true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ============================================
-- CLEANUP helper function
-- ============================================
DROP FUNCTION IF EXISTS drop_all_policies(TEXT);

-- ============================================
-- VERIFY
-- ============================================
SELECT tablename, policyname, cmd FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('challenges', 'challenge_ownership', 'challenge_entries', 'challenge_votes', 'battle_votes', 'reposts')
ORDER BY tablename, policyname;

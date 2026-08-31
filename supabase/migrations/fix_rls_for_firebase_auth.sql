-- Problem: auth.uid() is NULL because the app uses Firebase Auth, not Supabase Auth.
-- All RLS policies checking auth.uid() are silently rejecting every INSERT.
-- Fix: Allow any authenticated Supabase user to insert (since auth is handled client-side via Firebase).

-- ============================================
-- CHALLENGES TABLE
-- ============================================

-- Drop all existing policies on challenges
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'challenges'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON challenges', pol.policyname);
  END LOOP;
END $$;

-- Allow everyone to read challenges
CREATE POLICY "Challenges are viewable by everyone"
  ON challenges FOR SELECT USING (true);

-- Allow any authenticated user to create challenges
CREATE POLICY "Authenticated users can insert challenges"
  ON challenges FOR INSERT
  WITH CHECK (requesting_user_id() IS NOT NULL);

-- Allow updates (for admin controls — we check ownership in the app layer)
CREATE POLICY "Authenticated users can update challenges"
  ON challenges FOR UPDATE
  USING (requesting_user_id() IS NOT NULL);

-- Allow deletes (admin check done in app layer)
CREATE POLICY "Authenticated users can delete challenges"
  ON challenges FOR DELETE
  USING (requesting_user_id() IS NOT NULL);

-- ============================================
-- CHALLENGE_OWNERSHIP TABLE
-- ============================================

-- Drop all existing policies on challenge_ownership
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'challenge_ownership'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON challenge_ownership', pol.policyname);
  END LOOP;
END $$;

-- Everyone can read ownership
CREATE POLICY "Challenge ownership is viewable by everyone"
  ON challenge_ownership FOR SELECT USING (true);

-- Any authenticated user can insert ownership (app checks ownership before admin actions)
CREATE POLICY "Authenticated users can insert challenge ownership"
  ON challenge_ownership FOR INSERT
  WITH CHECK (requesting_user_id() IS NOT NULL);

-- ============================================
-- VERIFICATION
-- ============================================
SELECT tablename, policyname, cmd FROM pg_policies
WHERE tablename IN ('challenges', 'challenge_ownership')
ORDER BY tablename, policyname;

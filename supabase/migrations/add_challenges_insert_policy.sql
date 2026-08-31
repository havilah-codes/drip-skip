-- Allow authenticated users to create challenges
CREATE POLICY "Authenticated users can create challenges" ON challenges FOR INSERT
  WITH CHECK (auth.uid()::text = (SELECT firebase_uid FROM profiles WHERE id = created_by));

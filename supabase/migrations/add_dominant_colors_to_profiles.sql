-- Add dominant_colors column to profiles
-- Stores extracted dominant colors from avatar as JSON array of hex strings.
-- e.g. '["#7c3aed", "#ec4899", "#06b6d4"]

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dominant_colors TEXT;

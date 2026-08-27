-- Add card_gradient column to profiles
-- Stores the gradient preset name for the user's profile card on the explore page.

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS card_gradient TEXT;

-- No RLS changes needed — existing profile policies cover this.

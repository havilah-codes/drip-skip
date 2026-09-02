-- Add 'unfollow' and 'tag' to the allowed notification types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('drip', 'skip', 'follow', 'unfollow', 'comment', 'theme_vote', 'tag'));

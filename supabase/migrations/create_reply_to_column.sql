-- Add reply_to column to messages table
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS reply_to UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Index for fetching reply context
CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON messages(reply_to);

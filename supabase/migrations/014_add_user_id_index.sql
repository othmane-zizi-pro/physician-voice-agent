-- Add index on user_id column in calls table for faster user-specific queries
-- This improves performance when fetching a user's conversation history

CREATE INDEX IF NOT EXISTS idx_calls_user_id ON calls(user_id);

-- Also add a composite index for common query patterns (user + date sorting)
CREATE INDEX IF NOT EXISTS idx_calls_user_id_created_at ON calls(user_id, created_at DESC);

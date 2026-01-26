-- Add session_type column to distinguish voice vs text conversations
ALTER TABLE calls ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'voice';

-- Add index for filtering by session type
CREATE INDEX IF NOT EXISTS idx_calls_session_type ON calls(session_type);

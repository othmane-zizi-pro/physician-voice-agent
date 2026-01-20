-- Add frustration score for featuring quotes (0-10 scale)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS frustration_score INTEGER;

-- Index for fetching featured quotes efficiently
CREATE INDEX IF NOT EXISTS idx_calls_frustration_score ON calls(frustration_score DESC NULLS LAST);

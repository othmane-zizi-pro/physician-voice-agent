-- Add retell_call_id column for Retell voice platform migration
ALTER TABLE calls ADD COLUMN IF NOT EXISTS retell_call_id TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_calls_retell_call_id ON calls(retell_call_id);

-- Add unique constraint (a Retell call should only be saved once)
ALTER TABLE calls ADD CONSTRAINT calls_retell_call_id_unique UNIQUE (retell_call_id);

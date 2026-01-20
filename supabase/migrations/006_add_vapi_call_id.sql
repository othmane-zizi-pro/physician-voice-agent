-- Add vapi_call_id to link calls with Vapi's system for webhook updates
ALTER TABLE calls ADD COLUMN vapi_call_id TEXT UNIQUE;

-- Index for faster lookups when webhook arrives
CREATE INDEX idx_calls_vapi_call_id ON calls(vapi_call_id);

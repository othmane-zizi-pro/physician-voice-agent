-- Create usage_limits table for backend rate limiting
CREATE TABLE IF NOT EXISTS usage_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  fingerprint TEXT, -- browser fingerprint for extra tracking
  used_seconds INTEGER DEFAULT 0,
  window_start TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(ip_address)
);

-- Index for fast IP lookups
CREATE INDEX IF NOT EXISTS idx_usage_limits_ip ON usage_limits(ip_address);

-- Function to reset usage if window expired (24 hours)
CREATE OR REPLACE FUNCTION check_and_reset_usage(p_ip_address TEXT)
RETURNS TABLE(used_seconds INTEGER, window_start TIMESTAMP WITH TIME ZONE, remaining_seconds INTEGER) AS $$
DECLARE
  v_record usage_limits%ROWTYPE;
  v_limit_seconds INTEGER := 420; -- 7 minutes
BEGIN
  -- Get or create usage record
  SELECT * INTO v_record FROM usage_limits WHERE ip_address = p_ip_address;

  IF NOT FOUND THEN
    -- Create new record
    INSERT INTO usage_limits (ip_address, used_seconds, window_start)
    VALUES (p_ip_address, 0, NOW())
    RETURNING * INTO v_record;
  ELSIF v_record.window_start < NOW() - INTERVAL '24 hours' THEN
    -- Reset if window expired
    UPDATE usage_limits
    SET used_seconds = 0, window_start = NOW(), updated_at = NOW()
    WHERE ip_address = p_ip_address
    RETURNING * INTO v_record;
  END IF;

  RETURN QUERY SELECT
    v_record.used_seconds,
    v_record.window_start,
    GREATEST(0, v_limit_seconds - v_record.used_seconds)::INTEGER as remaining_seconds;
END;
$$ LANGUAGE plpgsql;

-- Function to add used time
CREATE OR REPLACE FUNCTION add_usage_time(p_ip_address TEXT, p_seconds INTEGER)
RETURNS TABLE(used_seconds INTEGER, remaining_seconds INTEGER, is_limited BOOLEAN) AS $$
DECLARE
  v_limit_seconds INTEGER := 420; -- 7 minutes
  v_new_used INTEGER;
BEGIN
  -- First check and reset if needed
  PERFORM check_and_reset_usage(p_ip_address);

  -- Add the time
  UPDATE usage_limits
  SET
    used_seconds = used_seconds + p_seconds,
    updated_at = NOW()
  WHERE ip_address = p_ip_address
  RETURNING usage_limits.used_seconds INTO v_new_used;

  RETURN QUERY SELECT
    v_new_used,
    GREATEST(0, v_limit_seconds - v_new_used)::INTEGER,
    v_new_used >= v_limit_seconds;
END;
$$ LANGUAGE plpgsql;

-- Enable RLS
ALTER TABLE usage_limits ENABLE ROW LEVEL SECURITY;

-- Allow public read/write for now (we'll use service role for actual operations)
CREATE POLICY "Allow all operations" ON usage_limits FOR ALL USING (true);

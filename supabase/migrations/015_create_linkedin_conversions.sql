-- LinkedIn Conversion API tracking table
CREATE TABLE linkedin_conversions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Event data
  event_type TEXT NOT NULL DEFAULT 'call_started',
  li_fat_id TEXT,                    -- LinkedIn click ID from cookie
  ip_address TEXT,
  user_agent TEXT,

  -- Response tracking
  linkedin_response_status INTEGER,   -- HTTP status code
  linkedin_response_body JSONB,       -- Full response for debugging
  success BOOLEAN NOT NULL DEFAULT FALSE,

  -- Link to internal data
  call_id UUID REFERENCES calls(id),

  -- Metadata
  page_url TEXT,
  referrer TEXT
);

-- Indexes for admin panel queries
CREATE INDEX idx_linkedin_conversions_created_at ON linkedin_conversions(created_at);
CREATE INDEX idx_linkedin_conversions_success ON linkedin_conversions(success);

-- RLS policies
ALTER TABLE linkedin_conversions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (from frontend tracking)
CREATE POLICY "Allow anonymous insert" ON linkedin_conversions
  FOR INSERT WITH CHECK (true);

-- Allow authenticated reads (for admin panel)
CREATE POLICY "Allow authenticated read" ON linkedin_conversions
  FOR SELECT USING (auth.role() = 'authenticated');

-- Allow service role full access
CREATE POLICY "Allow service role full access" ON linkedin_conversions
  FOR ALL USING (auth.role() = 'service_role');

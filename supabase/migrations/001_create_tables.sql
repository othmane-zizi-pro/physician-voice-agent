-- Create calls table
CREATE TABLE IF NOT EXISTS calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript TEXT,
  quotable_quote TEXT,
  recording_url TEXT,
  duration_seconds INTEGER,
  ip_address TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create leads table
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  is_physician_owner BOOLEAN,
  interested_in_collective BOOLEAN,
  name TEXT,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calls_ip_address ON calls(ip_address);
CREATE INDEX IF NOT EXISTS idx_leads_call_id ON leads(call_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_leads_interested ON leads(interested_in_collective) WHERE interested_in_collective = TRUE;

-- Enable Row Level Security
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Policy: Allow anonymous inserts (for public call tracking)
CREATE POLICY "Allow anonymous inserts on calls" ON calls
  FOR INSERT TO anon
  WITH CHECK (TRUE);

CREATE POLICY "Allow anonymous inserts on leads" ON leads
  FOR INSERT TO anon
  WITH CHECK (TRUE);

-- Policy: Allow authenticated users to read all (for admin panel)
CREATE POLICY "Allow authenticated read on calls" ON calls
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Allow authenticated read on leads" ON leads
  FOR SELECT TO authenticated
  USING (TRUE);

-- Policy: Allow authenticated users to update (for adding quotes, recordings)
CREATE POLICY "Allow authenticated update on calls" ON calls
  FOR UPDATE TO authenticated
  USING (TRUE);

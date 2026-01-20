-- Create featured_quotes table for curated quote management
CREATE TABLE featured_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
  quote TEXT NOT NULL,
  location TEXT,
  display_order INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for ordering queries
CREATE INDEX idx_featured_quotes_order ON featured_quotes(display_order);
CREATE INDEX idx_featured_quotes_active ON featured_quotes(is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE featured_quotes ENABLE ROW LEVEL SECURITY;

-- Allow anonymous read (for post-call form)
CREATE POLICY "Allow anonymous read on featured_quotes" ON featured_quotes
  FOR SELECT TO anon
  USING (is_active = true);

-- Allow authenticated users full access (admin panel)
CREATE POLICY "Allow authenticated full access on featured_quotes" ON featured_quotes
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

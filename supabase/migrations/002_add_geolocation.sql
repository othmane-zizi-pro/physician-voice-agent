-- Add geolocation columns to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS country TEXT;

-- Create index for geolocation queries
CREATE INDEX IF NOT EXISTS idx_calls_geolocation ON calls(latitude, longitude) WHERE latitude IS NOT NULL;

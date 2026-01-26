-- Create users table for end-user accounts
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  avatar_url TEXT,
  auth_provider TEXT NOT NULL, -- 'google' | 'email'
  password_hash TEXT, -- NULL for OAuth users
  email_verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  verification_token_expires TIMESTAMP WITH TIME ZONE,
  reset_token TEXT,
  reset_token_expires TIMESTAMP WITH TIME ZONE,

  -- Profile info
  role_type TEXT, -- 'physician' | 'nurse' | 'admin_staff' | 'other'
  workplace_type TEXT, -- 'independent' | 'hospital' | 'other'

  -- Location (from IP on signup or profile)
  city TEXT,
  region TEXT,
  country TEXT,

  -- Preferences
  ai_memory_enabled BOOLEAN DEFAULT TRUE,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Add user_id to calls table
ALTER TABLE calls ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- Create conversation_summaries table for AI context
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) NOT NULL,
  call_id UUID REFERENCES calls(id) NOT NULL,
  summary TEXT NOT NULL,
  key_topics TEXT[],
  emotional_state TEXT, -- 'frustrated' | 'venting' | 'seeking_advice' | 'reflective' | 'hopeful' | 'overwhelmed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_summaries_user_id ON conversation_summaries(user_id);
CREATE INDEX IF NOT EXISTS idx_summaries_call_id ON conversation_summaries(call_id);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_summaries ENABLE ROW LEVEL SECURITY;

-- Users can read and update their own profile
CREATE POLICY "Users can read own profile" ON users
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Users can update own profile" ON users
  FOR UPDATE TO authenticated
  USING (TRUE);

-- Allow inserts for registration
CREATE POLICY "Allow user registration" ON users
  FOR INSERT TO anon
  WITH CHECK (TRUE);

CREATE POLICY "Allow authenticated user registration" ON users
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

-- Conversation summaries policies
CREATE POLICY "Users can read own summaries" ON conversation_summaries
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "Allow insert summaries" ON conversation_summaries
  FOR INSERT TO authenticated
  WITH CHECK (TRUE);

-- Allow authenticated users to read calls (for admin and user dashboard)
CREATE POLICY "Allow authenticated read all calls" ON calls
  FOR SELECT TO authenticated
  USING (TRUE);

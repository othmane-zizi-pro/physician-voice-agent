-- Allow anonymous reads on calls and leads
-- Admin panel is protected by NextAuth, so RLS read restriction is redundant
CREATE POLICY "Allow anonymous read on calls" ON calls
  FOR SELECT TO anon
  USING (TRUE);

CREATE POLICY "Allow anonymous read on leads" ON leads
  FOR SELECT TO anon
  USING (TRUE);

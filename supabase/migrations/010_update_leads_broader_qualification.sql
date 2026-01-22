-- Add new broader qualification fields to leads table
-- These replace the narrower is_physician_owner and works_at_independent_clinic fields

-- New qualification fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS works_in_healthcare BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS workplace_type TEXT; -- 'independent' | 'hospital'
ALTER TABLE leads ADD COLUMN IF NOT EXISTS role_type TEXT; -- 'owner' | 'provider' | 'front_office'

-- Consent fields for transparency/trust
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_share_quote BOOLEAN;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS consent_store_chatlog BOOLEAN;

-- Add check constraints for enum-like fields
ALTER TABLE leads ADD CONSTRAINT check_workplace_type
  CHECK (workplace_type IS NULL OR workplace_type IN ('independent', 'hospital'));

ALTER TABLE leads ADD CONSTRAINT check_role_type
  CHECK (role_type IS NULL OR role_type IN ('owner', 'provider', 'front_office'));

-- Note: Keeping is_physician_owner and works_at_independent_clinic for backwards compatibility
-- They can be derived from the new fields:
--   is_physician_owner = (workplace_type = 'independent' AND role_type = 'owner')
--   works_at_independent_clinic = (workplace_type = 'independent')

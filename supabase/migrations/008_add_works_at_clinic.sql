-- Add works_at_independent_clinic field for non-physician-owners
ALTER TABLE leads ADD COLUMN IF NOT EXISTS works_at_independent_clinic BOOLEAN;

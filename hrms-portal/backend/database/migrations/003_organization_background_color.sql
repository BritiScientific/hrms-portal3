ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS brand_background_color TEXT NOT NULL DEFAULT '#f4f7fc';

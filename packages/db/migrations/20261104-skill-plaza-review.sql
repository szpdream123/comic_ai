ALTER TABLE skills DROP CONSTRAINT IF EXISTS skills_status_check;
ALTER TABLE skills ADD CONSTRAINT skills_status_check CHECK (status IN ('draft', 'published', 'disabled', 'rejected'));
ALTER TABLE skills ADD COLUMN IF NOT EXISTS review_comment text NOT NULL DEFAULT '';
ALTER TABLE skills ADD COLUMN IF NOT EXISTS reviewed_at timestamptz NULL;

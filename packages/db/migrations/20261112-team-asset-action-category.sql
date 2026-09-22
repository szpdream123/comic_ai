ALTER TABLE team_assets
  DROP CONSTRAINT IF EXISTS team_assets_asset_category_check;

ALTER TABLE team_assets
  ADD CONSTRAINT team_assets_asset_category_check
  CHECK (asset_category = ANY (ARRAY['character'::text, 'scene'::text, 'prop'::text, 'voice'::text, 'action'::text]));

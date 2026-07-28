ALTER TABLE creator_canvas_projects
  ADD COLUMN IF NOT EXISTS settings_json jsonb NOT NULL DEFAULT '{
    "schemaVersion": 1,
    "visualStyle": {
      "styleId": null,
      "prompt": "",
      "locked": false,
      "styleReferenceAssetId": null
    },
    "promptSuffixes": {
      "text": "",
      "image": "",
      "video": "",
      "audio": ""
    },
    "defaultModels": {
      "text": null,
      "image": null,
      "video": null,
      "audio": null
    },
    "generation": {
      "imageAspectRatio": "1:1",
      "imageSize": "1K",
      "imageFollowNode": false,
      "videoResolution": "720p",
      "videoDuration": 5,
      "videoFollowNode": false
    }
  }'::jsonb,
  ADD COLUMN IF NOT EXISTS settings_revision integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS settings_updated_by_principal_key text,
  ADD COLUMN IF NOT EXISTS settings_updated_by_team_member_id uuid REFERENCES team_members(id);

ALTER TABLE creator_canvas_projects
  DROP CONSTRAINT IF EXISTS creator_canvas_projects_settings_revision_check,
  ADD CONSTRAINT creator_canvas_projects_settings_revision_check CHECK (settings_revision >= 1),
  DROP CONSTRAINT IF EXISTS creator_canvas_projects_settings_json_check,
  ADD CONSTRAINT creator_canvas_projects_settings_json_check CHECK (
    jsonb_typeof(settings_json) = 'object'
    AND settings_json ->> 'schemaVersion' = '1'
    AND jsonb_typeof(settings_json -> 'visualStyle') = 'object'
    AND jsonb_typeof(settings_json -> 'promptSuffixes') = 'object'
    AND jsonb_typeof(settings_json -> 'defaultModels') = 'object'
    AND jsonb_typeof(settings_json -> 'generation') = 'object'
  ),
  DROP CONSTRAINT IF EXISTS creator_canvas_projects_settings_actor_check,
  ADD CONSTRAINT creator_canvas_projects_settings_actor_check CHECK (
    (settings_updated_by_principal_key IS NULL AND settings_updated_by_team_member_id IS NULL)
    OR (
      settings_updated_by_team_member_id IS NULL
      AND settings_updated_by_principal_key ~ '^owner:[0-9a-f-]{36}$'
    )
    OR (settings_updated_by_principal_key = 'member:' || settings_updated_by_team_member_id::text)
  );

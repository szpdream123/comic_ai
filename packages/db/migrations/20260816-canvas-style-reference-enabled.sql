UPDATE creator_canvas_projects
SET settings_json = jsonb_set(
  settings_json,
  '{visualStyle,styleReferenceEnabled}',
  'true'::jsonb,
  true
)
WHERE settings_json -> 'visualStyle' IS NOT NULL
  AND NOT (settings_json -> 'visualStyle' ? 'styleReferenceEnabled');

ALTER TABLE creator_canvas_projects
  ALTER COLUMN settings_json SET DEFAULT '{
    "schemaVersion": 1,
    "visualStyle": {
      "styleId": null,
      "prompt": "",
      "locked": false,
      "styleReferenceAssetId": null,
      "styleReferenceEnabled": true
    },
    "promptSuffixes": { "text": "", "image": "", "video": "", "audio": "" },
    "defaultModels": { "text": null, "image": null, "video": null, "audio": null },
    "generation": {
      "imageAspectRatio": "1:1",
      "imageSize": "1K",
      "imageFollowNode": false,
      "videoResolution": "720p",
      "videoDuration": 5,
      "videoFollowNode": false
    }
  }'::jsonb;

DELETE FROM prompt_user_defaults
WHERE prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract');

DELETE FROM prompt_official_defaults
WHERE prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract');

DELETE FROM prompt_ratings
WHERE prompt_id IN (
  SELECT id
  FROM prompts
  WHERE prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract')
);

DELETE FROM prompt_user_links
WHERE prompt_id IN (
  SELECT id
  FROM prompts
  WHERE prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract')
);

DELETE FROM prompts
WHERE prompt_category IN ('script', 'shot', 'scene_extract', 'character_extract', 'prop_extract');

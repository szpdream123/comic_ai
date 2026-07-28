INSERT INTO prompts (
  id,
  prompt_category,
  name,
  summary,
  prompt_content,
  status,
  is_official,
  is_published,
  price_credits,
  published_at,
  created_at,
  updated_at
)
SELECT
  '7a02a4cc-cfa7-4ff5-8d2c-253d6fd503df',
  'other',
  '通用提示词',
  '适用于未归入其它专业分类的通用创作任务。',
  '请根据用户提供的内容和具体要求完成任务，保持信息准确、结构清晰，并严格遵循用户指定的输出格式。',
  'enabled',
  true,
  true,
  0,
  now(),
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM prompts
  WHERE prompt_category = 'other'
    AND is_official = true
    AND status = 'enabled'
    AND is_published = true
    AND deleted_at IS NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO prompt_official_defaults (prompt_category, prompt_id)
SELECT 'other', id
FROM prompts
WHERE prompt_category = 'other'
  AND is_official = true
  AND status = 'enabled'
  AND is_published = true
  AND deleted_at IS NULL
ORDER BY updated_at DESC, id ASC
LIMIT 1
ON CONFLICT (prompt_category) DO NOTHING;

ALTER TABLE marketing_generation_skills
  ADD COLUMN IF NOT EXISTS skill_kind text NOT NULL DEFAULT 'video';

UPDATE marketing_generation_skills
SET skill_kind = CASE WHEN code = 'short-video-hook' THEN 'marketing' ELSE 'video' END,
    name = CASE WHEN code = 'short-video-hook' THEN '抖音营销文案与钩子' ELSE name END,
    description = CASE
      WHEN code = 'short-video-hook'
        THEN '用于抖音短视频营销策划，影响前 3 秒钩子、标题、口播文案、问题展开和自然收束。'
      ELSE description
    END,
    updated_at = now()
WHERE code IN ('short-video-hook', 'storyboard-continuity', 'seedance-motion');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'marketing_generation_skills_kind_check'
  ) THEN
    ALTER TABLE marketing_generation_skills
      ADD CONSTRAINT marketing_generation_skills_kind_check
      CHECK (skill_kind IN ('marketing', 'video'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS marketing_generation_skills_kind_status_order_idx
  ON marketing_generation_skills (skill_kind, status, display_order, name);

ALTER TABLE marketing_generation_runs
  ADD COLUMN IF NOT EXISTS marketing_skill_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO marketing_generation_skills (
  id, code, name, description, version, source_name, source_url, source_version,
  planning_instruction, media_instruction, applicable_platforms_json,
  applicable_content_types_json, status, display_order, approved_at, skill_kind
) VALUES (
  '4a2e36c4-88a8-4df0-bd48-59f68bca0cf2',
  'marketing-copy-frameworks',
  '营销文案结构（PAS / AIDA / BAB）',
  '根据主题选择 PAS、AIDA 或 BAB 结构，影响标题、正文、口播和结尾提问，适合图文与视频。',
  '1.0.0',
  'copywriting',
  'local-skill://copywriting',
  '1.2.0',
  'Choose one suitable copy structure from PAS, AIDA, or BAB. Write a concrete viewer-facing headline and concise Chinese copy using only supplied facts. Lead with the audience problem or useful outcome, explain one supported benefit, and close with a natural question rather than a forced sales CTA. Avoid clickbait, generic promotional claims, exaggerated urgency, and unsupported comparisons.',
  '',
  '["douyin"]'::jsonb,
  '["image", "video"]'::jsonb,
  'approved',
  20,
  now(),
  'marketing'
)
ON CONFLICT (code, version) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  source_name = EXCLUDED.source_name,
  source_url = EXCLUDED.source_url,
  source_version = EXCLUDED.source_version,
  planning_instruction = EXCLUDED.planning_instruction,
  media_instruction = EXCLUDED.media_instruction,
  applicable_platforms_json = EXCLUDED.applicable_platforms_json,
  applicable_content_types_json = EXCLUDED.applicable_content_types_json,
  status = EXCLUDED.status,
  display_order = EXCLUDED.display_order,
  skill_kind = EXCLUDED.skill_kind,
  updated_at = now();

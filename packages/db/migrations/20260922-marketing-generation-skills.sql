CREATE TABLE IF NOT EXISTS marketing_generation_skills (
  id uuid PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  version text NOT NULL,
  source_name text NOT NULL,
  source_url text NOT NULL,
  source_version text NOT NULL,
  planning_instruction text NOT NULL,
  media_instruction text NOT NULL,
  applicable_platforms_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  applicable_content_types_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'approved',
  display_order integer NOT NULL DEFAULT 100,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
  approved_by_admin_id uuid NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
  approved_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT marketing_generation_skills_code_version_unique UNIQUE (code, version),
  CONSTRAINT marketing_generation_skills_status_check CHECK (status IN ('draft', 'approved', 'disabled')),
  CONSTRAINT marketing_generation_skills_platforms_array_check CHECK (jsonb_typeof(applicable_platforms_json) = 'array'),
  CONSTRAINT marketing_generation_skills_content_types_array_check CHECK (jsonb_typeof(applicable_content_types_json) = 'array')
);

CREATE INDEX IF NOT EXISTS marketing_generation_skills_status_order_idx
  ON marketing_generation_skills (status, display_order, name);

ALTER TABLE marketing_generation_runs
  ADD COLUMN IF NOT EXISTS skill_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO marketing_generation_skills (
  id, code, name, description, version, source_name, source_url, source_version,
  planning_instruction, media_instruction, applicable_platforms_json,
  applicable_content_types_json, status, display_order, approved_at
) VALUES
  (
    '63b9d5d2-0ef2-4ae5-86ad-33eddf65b8c1',
    'short-video-hook',
    '短视频钩子与节奏',
    '强化前 3 秒钩子、问题展开和自然收束，适合抖音工具介绍、教程和低价能力说明。',
    '1.0.0',
    'kostja94/marketing-skills@video-marketing',
    'https://skills.sh/kostja94/marketing-skills/video-marketing',
    '1.0.1',
    'For short-form video, make the first 0-3 seconds immediately state a concrete question, contrast, or useful result. Then move through one audience problem, supported value, and a natural closing question. Keep spoken Chinese concise and conversational. Do not add forced calls to action, unsupported performance claims, or generic promotional language.',
    'Use fast but readable short-form pacing. Every shot must advance the same idea through a real action or visible result. Prefer clear cuts and concrete creator behavior over decorative montage, abstract symbolism, or repeated shots.',
    '["douyin"]'::jsonb,
    '["video"]'::jsonb,
    'approved',
    10,
    now()
  ),
  (
    'e1781844-dde7-46ec-b38f-8a9d44613431',
    'storyboard-continuity',
    '连续分镜与镜头一致性',
    '强调人物、服装、道具、场景连续，并让每个镜头推进新的动作或信息。',
    '1.0.0',
    'agentara/skills@video-storyboard',
    'https://skills.sh/agentara/skills/video-storyboard',
    'installed-2026-08-16',
    'Plan three distinct visual beats. Each shot must advance the action or reveal new information while preserving the same subject identity, wardrobe, props, location, lighting direction, and time of day. Vary shot size, camera angle, gesture, and composition without creating continuity jumps or redundant shots.',
    'Describe one continuous production-ready sequence with explicit subject, action, environment, camera movement, and transition for every shot. Preserve subject, wardrobe, props, location, and lighting across shots. Avoid repeated compositions, deformed hands, extra objects, random scene changes, subtitles, logos, and watermarks.',
    '["douyin"]'::jsonb,
    '["video"]'::jsonb,
    'approved',
    20,
    now()
  ),
  (
    'bd36a72c-5088-4878-a587-3dde666fa0d6',
    'seedance-motion',
    'Seedance 动态提示词',
    '将主题整理为主体、动作、环境、运镜、节奏和时间连续性明确的视频提示词。',
    '1.0.0',
    'pexoai/pexo-skills@seedance-2.0-prompter',
    'https://skills.sh/pexoai/pexo-skills/seedance-20-prompter',
    '2.1.0',
    'Structure the video plan around atomic elements: subject, action progression, environment, camera language, pacing, and simple story logic. Use text for camera movement, pacing, multi-shot structure, and ordinary motion. When no reference assets are supplied, do not invent @asset references or claim identity consistency from unavailable files.',
    'Write a Seedance-compatible text-only prompt with an explicit subject, executable action progression, stable environment, camera movement, pacing, and temporal continuity. Use simple physical motion and clear shot transitions. Do not emit @asset syntax unless real referenced assets are present, and never invent asset names.',
    '["douyin"]'::jsonb,
    '["video"]'::jsonb,
    'approved',
    30,
    now()
  )
ON CONFLICT (code, version) DO NOTHING;

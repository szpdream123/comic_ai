CREATE TABLE IF NOT EXISTS skill_categories (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  short_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 100,
  is_visible boolean NOT NULL DEFAULT true,
  is_system boolean NOT NULL DEFAULT false,
  is_skill_category boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS skill_categories_visible_sort_idx
  ON skill_categories (is_visible, sort_order, created_at);

INSERT INTO skill_categories (id, code, name, short_name, sort_order, is_visible, is_system, is_skill_category)
VALUES
  ('93000000-0000-4000-8000-000000000001', 'recommended', '推荐', '推荐', 10, true, true, false),
  ('93000000-0000-4000-8000-000000000002', 'professional-film', '专业影视', '影视', 20, true, false, true),
  ('93000000-0000-4000-8000-000000000003', 'commercial-ad', '商业广告', '广告', 30, true, false, true),
  ('93000000-0000-4000-8000-000000000004', 'short-drama', '短剧漫剧', '短剧', 40, true, false, true),
  ('93000000-0000-4000-8000-000000000005', 'animation-game', '动漫游戏', '动漫', 50, true, false, true),
  ('93000000-0000-4000-8000-000000000006', 'music-video', '音乐MV', 'MV', 60, true, false, true),
  ('93000000-0000-4000-8000-000000000007', 'creator', '自媒体创作', '自媒体', 70, true, false, true),
  ('93000000-0000-4000-8000-000000000008', 'general', '通用技能', '通用', 80, true, false, true),
  ('93000000-0000-4000-8000-000000000009', 'project-workflow', '项目工作流', '工作流', 90, true, false, true)
ON CONFLICT (code) DO NOTHING;

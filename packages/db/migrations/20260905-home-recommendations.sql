CREATE TABLE IF NOT EXISTS home_recommendation_categories (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  sort_order integer NOT NULL DEFAULT 100,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS home_recommendation_videos (
  id uuid PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES home_recommendation_categories(id) ON DELETE RESTRICT,
  title text NOT NULL,
  subtitle text NOT NULL DEFAULT '',
  cover_url text NOT NULL,
  video_url text NOT NULL DEFAULT '',
  duration_label text NOT NULL DEFAULT '',
  cover_alt text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  sort_order integer NOT NULL DEFAULT 100,
  created_by_admin_id uuid NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
  updated_by_admin_id uuid NULL REFERENCES admin_accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS home_recommendation_videos_category_sort_idx
  ON home_recommendation_videos (category_id, status, sort_order, created_at);

INSERT INTO home_recommendation_categories (id, code, name, sort_order)
VALUES
  ('91000000-0000-4000-8000-000000000001', 'recommended', '推荐', 10),
  ('91000000-0000-4000-8000-000000000002', 'popular', '热门', 20),
  ('91000000-0000-4000-8000-000000000003', 'new', '新晋', 30)
ON CONFLICT (code) DO NOTHING;

INSERT INTO home_recommendation_videos (
  id, category_id, title, subtitle, cover_url, duration_label, cover_alt, sort_order
)
VALUES
  ('92000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001', '霓虹夜行', '都市幻想 · AI 短片', '/assets/library/official/scenes/scene-3d-neon-street.png', '00:32', '霓虹城市夜景作品封面', 10),
  ('92000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001', '云巅星河', '东方玄幻 · AI 漫剧', '/assets/library/official/scenes/scene-3d-star-cliff.png', '00:48', '星空仙境作品封面', 20),
  ('92000000-0000-4000-8000-000000000003', '91000000-0000-4000-8000-000000000001', '莲境春深', '国风动画 · AI 短片', '/assets/library/official/scenes/scene-2d-lotus.png', '01:06', '荷塘仙境作品封面', 30),
  ('92000000-0000-4000-8000-000000000004', '91000000-0000-4000-8000-000000000001', '浮空航线', '蒸汽幻想 · AI 预告', '/assets/library/official/scenes/scene-3d-airship.png', '00:41', '浮空飞艇作品封面', 40),
  ('92000000-0000-4000-8000-000000000005', '91000000-0000-4000-8000-000000000001', '森语', '奇幻冒险 · AI 动画', '/assets/library/official/scenes/scene-3d-forest.png', '00:55', '森林奇境作品封面', 50),
  ('92000000-0000-4000-8000-000000000006', '91000000-0000-4000-8000-000000000001', '月下长桥', '古风叙事 · AI 漫剧', '/assets/library/official/scenes/scene-2d-moon-bridge.png', '00:37', '月下古桥作品封面', 60),
  ('92000000-0000-4000-8000-000000000007', '91000000-0000-4000-8000-000000000002', '赛博回声', '未来都市 · 热门短片', '/assets/library/official/scenes/scene-3d-cyber-mall.png', '00:46', '赛博商场作品封面', 10),
  ('92000000-0000-4000-8000-000000000008', '91000000-0000-4000-8000-000000000002', '试炼之门', '东方幻想 · 热门漫剧', '/assets/library/official/scenes/scene-3d-trial-gate.png', '01:12', '秘境大门作品封面', 20),
  ('92000000-0000-4000-8000-000000000009', '91000000-0000-4000-8000-000000000002', '剑影无声', '武侠动作 · 热门动画', '/assets/library/official/scenes/scene-2d-sword.png', '00:58', '剑侠作品封面', 30),
  ('92000000-0000-4000-8000-000000000010', '91000000-0000-4000-8000-000000000002', '星际列车', '科幻旅行 · AI 短片', '/assets/library/official/scenes/scene-3d-railway.png', '00:39', '未来列车作品封面', 40),
  ('92000000-0000-4000-8000-000000000011', '91000000-0000-4000-8000-000000000002', '长街灯火', '古装群像 · AI 漫剧', '/assets/library/official/scenes/scene-ancient-market.png', '01:03', '古代市集作品封面', 50),
  ('92000000-0000-4000-8000-000000000012', '91000000-0000-4000-8000-000000000002', '星落人间', '浪漫幻想 · AI 动画', '/assets/library/official/scenes/scene-2d-starry.png', '00:44', '星空作品封面', 60),
  ('92000000-0000-4000-8000-000000000013', '91000000-0000-4000-8000-000000000003', '云端事务所', '轻科幻 · 新晋短片', '/assets/library/official/scenes/scene-3d-cloud-office.png', '00:35', '云端办公室作品封面', 10),
  ('92000000-0000-4000-8000-000000000014', '91000000-0000-4000-8000-000000000003', '炼金时刻', '奇幻日常 · 新晋漫剧', '/assets/library/official/scenes/scene-3d-alchemy.png', '00:52', '炼金工坊作品封面', 20),
  ('92000000-0000-4000-8000-000000000015', '91000000-0000-4000-8000-000000000003', '竹间听雨', '东方美学 · 新晋动画', '/assets/library/official/scenes/scene-2d-bamboo.png', '00:43', '竹林作品封面', 30),
  ('92000000-0000-4000-8000-000000000016', '91000000-0000-4000-8000-000000000003', '片场之后', '创作纪实 · AI 短片', '/assets/library/official/scenes/scene-3d-studio.png', '00:49', '虚拟片场作品封面', 40),
  ('92000000-0000-4000-8000-000000000017', '91000000-0000-4000-8000-000000000003', '天台来信', '青春校园 · AI 漫剧', '/assets/library/official/scenes/scene-2d-rooftop.png', '00:57', '校园天台作品封面', 50),
  ('92000000-0000-4000-8000-000000000018', '91000000-0000-4000-8000-000000000003', '深渊回响', '冒险悬疑 · AI 动画', '/assets/library/official/scenes/scene-3d-cave.png', '01:08', '洞窟作品封面', 60)
ON CONFLICT (id) DO NOTHING;

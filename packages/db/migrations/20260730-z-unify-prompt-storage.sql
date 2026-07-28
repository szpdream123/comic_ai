CREATE TABLE prompts (
  id uuid PRIMARY KEY,
  prompt_category text NOT NULL,
  name text NOT NULL,
  summary text NOT NULL DEFAULT '',
  prompt_content text NOT NULL,
  cover_image_url text,
  status text NOT NULL DEFAULT 'enabled',
  is_official boolean NOT NULL DEFAULT true,
  is_published boolean NOT NULL DEFAULT false,
  price_credits integer NOT NULL DEFAULT 0,
  usage_count integer NOT NULL DEFAULT 0,
  rating_sum integer NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_by_admin_id uuid REFERENCES admin_accounts(id),
  updated_by_admin_id uuid REFERENCES admin_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT prompts_category_check CHECK (
    prompt_category IN (
      'script',
      'shot',
      'scene_extract',
      'character_extract',
      'prop_extract',
      'image_style',
      'storyboard',
      'other'
    )
  ),
  CONSTRAINT prompts_status_check CHECK (status IN ('enabled', 'disabled', 'archived')),
  CONSTRAINT prompts_price_check CHECK (price_credits >= 0),
  CONSTRAINT prompts_usage_check CHECK (usage_count >= 0),
  CONSTRAINT prompts_rating_check CHECK (
    rating_sum >= 0 AND rating_count >= 0 AND rating_sum <= rating_count * 5
  )
);

CREATE INDEX prompts_catalog_idx
  ON prompts (is_published, prompt_category, is_official DESC, usage_count DESC, published_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX prompts_admin_idx
  ON prompts (prompt_category, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE prompt_user_links (
  id uuid PRIMARY KEY,
  prompt_id uuid NOT NULL REFERENCES prompts(id),
  user_id uuid NOT NULL REFERENCES users(id),
  relation_type text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  price_credits_paid integer NOT NULL DEFAULT 0,
  credit_reservation_id uuid REFERENCES credit_reservations(id),
  rating integer,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_user_links_relation_check CHECK (relation_type IN ('owner', 'added')),
  CONSTRAINT prompt_user_links_status_check CHECK (status IN ('active', 'removed')),
  CONSTRAINT prompt_user_links_price_check CHECK (price_credits_paid >= 0),
  CONSTRAINT prompt_user_links_rating_check CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);

CREATE UNIQUE INDEX prompt_user_links_active_uidx
  ON prompt_user_links (prompt_id, user_id)
  WHERE status = 'active';

CREATE INDEX prompt_user_links_user_idx
  ON prompt_user_links (user_id, status, relation_type, added_at DESC);

WITH official_sources AS (
  SELECT
    'storyboard_prompt_package'::text AS source_type,
    id,
    'script'::text AS prompt_category,
    name,
    prompt_content,
    cover_image_url,
    status,
    created_by_admin_id,
    updated_by_admin_id,
    created_at,
    updated_at,
    deleted_at
  FROM storyboard_prompt_packages
  UNION ALL
  SELECT 'shot_prompt_template', id, 'shot', name, prompt_content, NULL::text, status,
    created_by_admin_id, updated_by_admin_id, created_at, updated_at, deleted_at
  FROM shot_prompt_templates
  UNION ALL
  SELECT 'scene_prompt_template', id, 'scene_extract', name, prompt_content, NULL::text, status,
    created_by_admin_id, updated_by_admin_id, created_at, updated_at, deleted_at
  FROM scene_prompt_templates
  UNION ALL
  SELECT 'character_prompt_template', id, 'character_extract', name, prompt_content, NULL::text, status,
    created_by_admin_id, updated_by_admin_id, created_at, updated_at, deleted_at
  FROM character_prompt_templates
  UNION ALL
  SELECT 'prop_prompt_template', id, 'prop_extract', name, prompt_content, NULL::text, status,
    created_by_admin_id, updated_by_admin_id, created_at, updated_at, deleted_at
  FROM prop_prompt_templates
  UNION ALL
  SELECT 'image_prompt_style', id, 'image_style', name, prompt_content, cover_image_url, status,
    created_by_admin_id, updated_by_admin_id, created_at, updated_at, deleted_at
  FROM image_prompt_styles
  UNION ALL
  SELECT 'storyboard_prompt_template', id, 'storyboard', name, base_prompt, NULL::text, status,
    created_by_admin_id, updated_by_admin_id, created_at, updated_at, deleted_at
  FROM storyboard_prompt_templates
)
INSERT INTO prompts (
  id, prompt_category, name, summary, prompt_content, cover_image_url, status,
  is_official, is_published, price_credits, usage_count, rating_sum,
  rating_count, published_at, created_by_admin_id, updated_by_admin_id,
  created_at, updated_at, deleted_at
)
SELECT
  source.id,
  source.prompt_category,
  source.name,
  COALESCE(market.summary, '官方发布的提示词，可直接添加到私人提示词库使用。'),
  source.prompt_content,
  source.cover_image_url,
  source.status,
  true,
  COALESCE(market.status = 'published', source.status = 'enabled'),
  COALESCE(market.price_credits, 0),
  COALESCE(market.usage_count, 0),
  COALESCE(market.rating_sum, 0),
  COALESCE(market.rating_count, 0),
  COALESCE(market.published_at, CASE WHEN source.status = 'enabled' THEN source.updated_at ELSE NULL END),
  source.created_by_admin_id,
  source.updated_by_admin_id,
  source.created_at,
  source.updated_at,
  source.deleted_at
FROM official_sources source
LEFT JOIN prompt_marketplace_items market
  ON market.source_type = source.source_type
  AND market.source_id = source.id::text
  AND market.deleted_at IS NULL;

INSERT INTO prompts (
  id, prompt_category, name, summary, prompt_content, status,
  is_official, is_published, price_credits, usage_count, rating_sum,
  rating_count, published_at, created_at, updated_at, deleted_at
)
SELECT
  market.id,
  market.prompt_category,
  market.title,
  market.summary,
  market.prompt_content,
  CASE WHEN market.status = 'archived' THEN 'archived' ELSE 'enabled' END,
  market.is_official,
  market.status = 'published',
  market.price_credits,
  market.usage_count,
  market.rating_sum,
  market.rating_count,
  market.published_at,
  market.created_at,
  market.updated_at,
  market.deleted_at
FROM prompt_marketplace_items market
WHERE NOT EXISTS (
  SELECT 1
  FROM prompts prompt
  WHERE prompt.id = market.id
     OR (market.source_id IS NOT NULL AND prompt.id::text = market.source_id)
);

INSERT INTO prompt_user_links (
  id, prompt_id, user_id, relation_type, status, added_at, created_at, updated_at
)
SELECT
  market.id,
  prompt.id,
  market.owner_user_id,
  'owner',
  CASE WHEN market.deleted_at IS NULL THEN 'active' ELSE 'removed' END,
  market.created_at,
  market.created_at,
  market.updated_at
FROM prompt_marketplace_items market
JOIN prompts prompt ON prompt.id = market.id
WHERE market.owner_user_id IS NOT NULL;

INSERT INTO prompt_user_links (
  id, prompt_id, user_id, relation_type, status, price_credits_paid,
  credit_reservation_id, rating, added_at, removed_at, last_used_at,
  created_at, updated_at
)
SELECT
  purchase.id,
  prompt.id,
  purchase.buyer_user_id,
  'added',
  purchase.status,
  purchase.price_credits,
  purchase.credit_reservation_id,
  rating.rating,
  purchase.purchased_at,
  purchase.removed_at,
  purchase.last_used_at,
  purchase.created_at,
  purchase.updated_at
FROM prompt_marketplace_purchases purchase
JOIN prompt_marketplace_items market ON market.id = purchase.item_id
JOIN prompts prompt
  ON prompt.id = market.id
  OR (market.is_official = true AND market.source_id IS NOT NULL AND prompt.id::text = market.source_id)
LEFT JOIN prompt_marketplace_ratings rating
  ON rating.item_id = purchase.item_id
  AND rating.user_id = purchase.buyer_user_id;

UPDATE prompt_user_links older
SET rating = NULL
WHERE older.rating IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM prompt_user_links newer
    WHERE newer.prompt_id = older.prompt_id
      AND newer.user_id = older.user_id
      AND newer.relation_type = 'added'
      AND newer.added_at > older.added_at
  );

DROP TABLE storyboard_prompt_package_versions;
DROP TABLE storyboard_prompt_templates;
DROP TABLE storyboard_prompt_packages;
DROP TABLE shot_prompt_templates;
DROP TABLE scene_prompt_templates;
DROP TABLE character_prompt_templates;
DROP TABLE prop_prompt_templates;
DROP TABLE image_prompt_styles;
DROP TABLE prompt_marketplace_ratings;
DROP TABLE prompt_marketplace_purchases;
DROP TABLE prompt_marketplace_items;

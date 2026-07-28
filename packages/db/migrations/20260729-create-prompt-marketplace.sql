CREATE TABLE IF NOT EXISTS prompt_marketplace_items (
  id uuid PRIMARY KEY,
  owner_user_id uuid REFERENCES users(id),
  source_type text NOT NULL,
  source_id text,
  prompt_category text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  prompt_content text NOT NULL,
  tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  price_credits integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  is_official boolean NOT NULL DEFAULT false,
  usage_count integer NOT NULL DEFAULT 0,
  rating_sum integer NOT NULL DEFAULT 0,
  rating_count integer NOT NULL DEFAULT 0,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT prompt_marketplace_items_category_check CHECK (
    prompt_category IN (
      'script',
      'shot',
      'scene_extract',
      'character_extract',
      'prop_extract',
      'image_style',
      'storyboard'
    )
  ),
  CONSTRAINT prompt_marketplace_items_price_check CHECK (price_credits >= 0),
  CONSTRAINT prompt_marketplace_items_status_check CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT prompt_marketplace_items_usage_check CHECK (usage_count >= 0),
  CONSTRAINT prompt_marketplace_items_rating_check CHECK (
    rating_sum >= 0 AND rating_count >= 0 AND rating_sum <= rating_count * 5
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_marketplace_items_source_uidx
  ON prompt_marketplace_items (source_type, source_id)
  WHERE source_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS prompt_marketplace_items_catalog_idx
  ON prompt_marketplace_items (status, prompt_category, is_official DESC, usage_count DESC, published_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS prompt_marketplace_items_owner_idx
  ON prompt_marketplace_items (owner_user_id, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS prompt_marketplace_purchases (
  id uuid PRIMARY KEY,
  item_id uuid NOT NULL REFERENCES prompt_marketplace_items(id),
  buyer_user_id uuid NOT NULL REFERENCES users(id),
  price_credits integer NOT NULL,
  status text NOT NULL DEFAULT 'active',
  credit_reservation_id uuid REFERENCES credit_reservations(id),
  purchased_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_marketplace_purchases_price_check CHECK (price_credits >= 0),
  CONSTRAINT prompt_marketplace_purchases_status_check CHECK (status IN ('active', 'removed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS prompt_marketplace_purchases_active_uidx
  ON prompt_marketplace_purchases (item_id, buyer_user_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS prompt_marketplace_purchases_buyer_idx
  ON prompt_marketplace_purchases (buyer_user_id, status, purchased_at DESC);

CREATE TABLE IF NOT EXISTS prompt_marketplace_ratings (
  item_id uuid NOT NULL REFERENCES prompt_marketplace_items(id),
  user_id uuid NOT NULL REFERENCES users(id),
  rating integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id),
  CONSTRAINT prompt_marketplace_ratings_value_check CHECK (rating BETWEEN 1 AND 5)
);

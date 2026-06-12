ALTER TABLE users
  ADD COLUMN IF NOT EXISTS wechat_app_id text NULL,
  ADD COLUMN IF NOT EXISTS wechat_openid text NULL,
  ADD COLUMN IF NOT EXISTS wechat_unionid text NULL,
  ADD COLUMN IF NOT EXISTS wechat_nickname text NULL,
  ADD COLUMN IF NOT EXISTS wechat_avatar_url text NULL,
  ADD COLUMN IF NOT EXISTS wechat_last_login_at timestamptz NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_wechat_app_openid_unique
  ON users (wechat_app_id, wechat_openid)
  WHERE wechat_app_id IS NOT NULL AND wechat_openid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_wechat_app_unionid_unique
  ON users (wechat_app_id, wechat_unionid)
  WHERE wechat_app_id IS NOT NULL AND wechat_unionid IS NOT NULL;

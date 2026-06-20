ALTER TABLE admin_secret_references
  ADD COLUMN IF NOT EXISTS secret_value text NULL;

COMMENT ON COLUMN admin_secret_references.secret_value IS '后台维护的供应商 API 密钥明文值。接口响应必须脱敏，禁止返回给前端。';

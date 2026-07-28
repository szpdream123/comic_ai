ALTER TABLE ai_model_configs
  DROP CONSTRAINT IF EXISTS ai_model_configs_provider_protocol_check;

ALTER TABLE ai_model_configs
  ADD CONSTRAINT ai_model_configs_provider_protocol_check CHECK (provider_protocol IN (
    'creator_dev',
    'openai_images',
    'openai_compatible_chat',
    'volcengine_ark_image',
    'volcengine_ark_video',
    'aliyun_bailian_video',
    'aliyun_bailian_audio',
    'globalaiopc_video',
    'lingdong_api',
    'cumob_image',
    'global_ai_opc_image',
    'extra_token_video',
    'saier_video',
    'comfyui',
    'custom_http'
  ));

CREATE TABLE IF NOT EXISTS comfyui_workflows (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  category text,
  media_type text NOT NULL,
  status text DEFAULT 'active' NOT NULL,
  current_version_id uuid,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  deleted_at timestamp with time zone,
  CONSTRAINT comfyui_workflows_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT comfyui_workflows_media_type_check CHECK (media_type IN ('image', 'video', 'audio')),
  CONSTRAINT comfyui_workflows_status_check CHECK (status IN ('active', 'disabled', 'archived'))
);

CREATE TABLE IF NOT EXISTS comfyui_workflow_versions (
  id uuid PRIMARY KEY,
  workflow_id uuid NOT NULL REFERENCES comfyui_workflows(id) ON DELETE CASCADE,
  version integer NOT NULL,
  content_json jsonb NOT NULL,
  content_hash text NOT NULL,
  io_mapping_json jsonb NOT NULL,
  node_types_json jsonb NOT NULL,
  created_by_user_id uuid REFERENCES users(id),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT comfyui_workflow_versions_version_check CHECK (version >= 1),
  CONSTRAINT comfyui_workflow_versions_content_hash_check CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT comfyui_workflow_versions_workflow_version_uidx UNIQUE (workflow_id, version)
);

ALTER TABLE comfyui_workflows
  DROP CONSTRAINT IF EXISTS comfyui_workflows_current_version_fkey;
ALTER TABLE comfyui_workflows
  ADD CONSTRAINT comfyui_workflows_current_version_fkey
  FOREIGN KEY (current_version_id) REFERENCES comfyui_workflow_versions(id);

CREATE INDEX IF NOT EXISTS comfyui_workflows_user_updated_idx
  ON comfyui_workflows (user_id, updated_at DESC, id DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS comfyui_workflow_versions_workflow_created_idx
  ON comfyui_workflow_versions (workflow_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION reject_comfyui_workflow_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'comfyui_workflow_version_immutable';
END;
$$;

DROP TRIGGER IF EXISTS comfyui_workflow_versions_immutable ON comfyui_workflow_versions;
CREATE TRIGGER comfyui_workflow_versions_immutable
BEFORE UPDATE ON comfyui_workflow_versions
FOR EACH ROW EXECUTE FUNCTION reject_comfyui_workflow_version_mutation();

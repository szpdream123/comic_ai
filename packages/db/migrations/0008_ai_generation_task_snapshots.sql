CREATE TABLE IF NOT EXISTS ai_generation_task_snapshots (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  workspace_id uuid NULL,
  project_id uuid NULL,
  episode_id uuid NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  workflow_id uuid NOT NULL,
  task_id uuid NOT NULL,
  attempt_id uuid NULL,
  provider_request_id uuid NULL,
  model_config_id uuid NULL REFERENCES ai_model_configs(id),
  credit_reservation_id uuid NULL,
  model_code text NOT NULL,
  media_type text NOT NULL,
  task_mode text NOT NULL,
  status text NOT NULL,
  progress_stage text NOT NULL,
  progress_percent integer NULL CHECK (progress_percent IS NULL OR (progress_percent >= 0 AND progress_percent <= 100)),
  request_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider_status_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_assets_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  failure_json jsonb NULL,
  estimated_credits integer NOT NULL DEFAULT 0 CHECK (estimated_credits >= 0),
  credit_status text NOT NULL DEFAULT 'not_required',
  credit_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz NOT NULL,
  started_at timestamptz NULL,
  completed_at timestamptz NULL,
  failed_at timestamptz NULL,
  last_polled_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, id),
  UNIQUE (organization_id, task_id),
  CHECK (media_type IN ('image', 'video', 'audio', 'text', 'multimodal')),
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'canceled', 'result_unknown', 'manual_review_required')),
  CHECK (credit_status IN ('not_required', 'reserved', 'consumed', 'released', 'manual_review_required')),
  FOREIGN KEY (organization_id, workspace_id)
    REFERENCES workspaces (organization_id, id),
  FOREIGN KEY (organization_id, project_id)
    REFERENCES projects (organization_id, id),
  FOREIGN KEY (organization_id, episode_id)
    REFERENCES episodes (organization_id, id),
  FOREIGN KEY (organization_id, workflow_id)
    REFERENCES workflows (organization_id, id),
  FOREIGN KEY (organization_id, task_id)
    REFERENCES tasks (organization_id, id),
  FOREIGN KEY (organization_id, attempt_id)
    REFERENCES task_attempts (organization_id, id),
  FOREIGN KEY (organization_id, provider_request_id)
    REFERENCES provider_requests (organization_id, id),
  FOREIGN KEY (organization_id, credit_reservation_id)
    REFERENCES credit_reservations (organization_id, id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ai_generation_task_snapshots_task_uidx
  ON ai_generation_task_snapshots (organization_id, task_id);

CREATE INDEX IF NOT EXISTS ai_generation_task_snapshots_target_idx
  ON ai_generation_task_snapshots (organization_id, episode_id, target_type, target_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_generation_task_snapshots_status_idx
  ON ai_generation_task_snapshots (organization_id, status, updated_at DESC);

COMMENT ON TABLE ai_generation_task_snapshots IS
'AI生成任务轮询快照表。用于把前端轮询、失败回显、积分状态和结果资产集中成可快速读取的任务事实快照。';

COMMENT ON COLUMN ai_generation_task_snapshots.id IS '快照主键。';
COMMENT ON COLUMN ai_generation_task_snapshots.organization_id IS '所属组织，用于租户隔离。';
COMMENT ON COLUMN ai_generation_task_snapshots.workspace_id IS '所属工作区。';
COMMENT ON COLUMN ai_generation_task_snapshots.project_id IS '所属项目。';
COMMENT ON COLUMN ai_generation_task_snapshots.episode_id IS '所属剧集。';
COMMENT ON COLUMN ai_generation_task_snapshots.target_type IS '生成目标类型，例如 episode、storyboard、asset。';
COMMENT ON COLUMN ai_generation_task_snapshots.target_id IS '生成目标 ID。';
COMMENT ON COLUMN ai_generation_task_snapshots.workflow_id IS '关联工作流 ID。';
COMMENT ON COLUMN ai_generation_task_snapshots.task_id IS '前端轮询和回显用的任务 ID。';
COMMENT ON COLUMN ai_generation_task_snapshots.attempt_id IS '当前执行尝试 ID。';
COMMENT ON COLUMN ai_generation_task_snapshots.provider_request_id IS '当前供应商请求 ID。';
COMMENT ON COLUMN ai_generation_task_snapshots.model_config_id IS '关联模型配置 ID。';
COMMENT ON COLUMN ai_generation_task_snapshots.credit_reservation_id IS '关联积分预扣记录 ID。';
COMMENT ON COLUMN ai_generation_task_snapshots.model_code IS '任务创建时使用的平台模型编码。';
COMMENT ON COLUMN ai_generation_task_snapshots.media_type IS '生成产物类型。';
COMMENT ON COLUMN ai_generation_task_snapshots.task_mode IS '业务任务模式，例如 image.generate、video.image_to_video。';
COMMENT ON COLUMN ai_generation_task_snapshots.status IS '任务聚合状态，供前端轮询展示。';
COMMENT ON COLUMN ai_generation_task_snapshots.progress_stage IS '阶段文案键，例如 queued、provider_submitted、saving_asset、completed。';
COMMENT ON COLUMN ai_generation_task_snapshots.progress_percent IS '进度百分比；供应商不提供时可为空。';
COMMENT ON COLUMN ai_generation_task_snapshots.request_summary_json IS '脱敏后的请求摘要，不保存完整敏感原文。';
COMMENT ON COLUMN ai_generation_task_snapshots.provider_status_json IS '供应商状态摘要，包括外部任务 ID、供应商状态和脱敏响应。';
COMMENT ON COLUMN ai_generation_task_snapshots.result_assets_json IS '成功后的资产摘要数组，包括 assetVersionId、url、mimeType 等。';
COMMENT ON COLUMN ai_generation_task_snapshots.failure_json IS '失败摘要，包括 failureCode、providerErrorCode、providerMessage、displayMessage。';
COMMENT ON COLUMN ai_generation_task_snapshots.estimated_credits IS '创建任务时计算出的预计积分。';
COMMENT ON COLUMN ai_generation_task_snapshots.credit_status IS '积分状态：not_required、reserved、consumed、released、manual_review_required。';
COMMENT ON COLUMN ai_generation_task_snapshots.credit_summary_json IS '积分摘要，包括预扣、消耗、返还和结算时间。';
COMMENT ON COLUMN ai_generation_task_snapshots.submitted_at IS '提交到平台任务系统的时间。';
COMMENT ON COLUMN ai_generation_task_snapshots.started_at IS 'Worker 开始处理时间。';
COMMENT ON COLUMN ai_generation_task_snapshots.completed_at IS '任务成功完成时间。';
COMMENT ON COLUMN ai_generation_task_snapshots.failed_at IS '任务失败时间。';
COMMENT ON COLUMN ai_generation_task_snapshots.last_polled_at IS '异步供应商最近一次轮询时间。';
COMMENT ON COLUMN ai_generation_task_snapshots.created_at IS '创建时间。';
COMMENT ON COLUMN ai_generation_task_snapshots.updated_at IS '最后更新时间。';

-- Generated from the current user-centric schema catalog. No business data is included.

CREATE SEQUENCE IF NOT EXISTS "user_invite_code_seq" AS bigint INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;

CREATE OR REPLACE FUNCTION generate_random_user_invite_code_candidate()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  generated text := '';
  position_index integer;
BEGIN
  FOR position_index IN 1..10 LOOP
    generated := generated || substr(alphabet, floor(random() * 36)::integer + 1, 1);
  END LOOP;

  RETURN generated;
END;
$function$;

CREATE OR REPLACE FUNCTION generate_user_invite_code()
 RETURNS text
 LANGUAGE plpgsql
AS $function$
DECLARE
  candidate text;
BEGIN
  LOOP
    candidate := generate_random_user_invite_code_candidate();

    IF NOT EXISTS (
      SELECT 1
      FROM users
      WHERE invite_code = candidate
    ) THEN
      RETURN candidate;
    END IF;
  END LOOP;
END;
$function$;

CREATE TABLE IF NOT EXISTS "admin_account_roles" (
  "id" uuid NOT NULL,
  "admin_account_id" uuid NOT NULL,
  "role_code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "admin_accounts" (
  "id" uuid NOT NULL,
  "login_name" text NOT NULL,
  "password_hash" text NOT NULL,
  "display_name" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "remark" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "failed_login_count" integer DEFAULT 0 NOT NULL,
  "locked_until" timestamp with time zone,
  "super_admin_slot" integer
);

CREATE TABLE IF NOT EXISTS "admin_auth_sessions" (
  "id" uuid NOT NULL,
  "admin_account_id" uuid NOT NULL,
  "session_token_hash" text NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "expires_at" timestamp with time zone NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "admin_secret_references" (
  "id" uuid NOT NULL,
  "secret_ref" text NOT NULL,
  "env_name" text NOT NULL,
  "purpose" text NOT NULL,
  "provider_name" text,
  "status" text DEFAULT 'unknown'::text NOT NULL,
  "last_checked_at" timestamp with time zone,
  "created_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "secret_value" text
);

CREATE TABLE IF NOT EXISTS "admin_secret_values" (
  "id" uuid NOT NULL,
  "secret_ref" text NOT NULL,
  "secret_key" text NOT NULL,
  "secret_value" text NOT NULL,
  "purpose" text DEFAULT ''::text NOT NULL,
  "provider_name" text,
  "status" text DEFAULT 'configured'::text NOT NULL,
  "last_checked_at" timestamp with time zone,
  "created_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "request_domain" text
);

CREATE TABLE IF NOT EXISTS "ai_generation_task_snapshots" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "episode_id" uuid,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "workflow_id" uuid NOT NULL,
  "task_id" uuid NOT NULL,
  "attempt_id" uuid,
  "provider_request_id" uuid,
  "model_config_id" uuid,
  "provider_config_revision_id" text,
  "credential_version_ref" text,
  "credit_reservation_id" uuid,
  "model_code" text NOT NULL,
  "media_type" text NOT NULL,
  "task_mode" text NOT NULL,
  "status" text NOT NULL,
  "progress_stage" text NOT NULL,
  "progress_percent" integer,
  "request_summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "provider_status_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result_assets_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "failure_json" jsonb,
  "estimated_credits" integer DEFAULT 0 NOT NULL,
  "credit_status" text DEFAULT 'not_required'::text NOT NULL,
  "credit_summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "submitted_at" timestamp with time zone NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "last_polled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "ai_model_config_revisions" (
  "id" uuid NOT NULL,
  "model_config_id" uuid NOT NULL,
  "snapshot_json" jsonb NOT NULL,
  "changed_by_admin_id" uuid,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ai_model_configs" (
  "id" uuid NOT NULL,
  "model_code" text NOT NULL,
  "display_name" text NOT NULL,
  "provider_name" text NOT NULL,
  "provider_model" text NOT NULL,
  "provider_protocol" text NOT NULL,
  "invocation_mode" text NOT NULL,
  "media_type" text NOT NULL,
  "task_modes_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "capabilities_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "parameter_schema_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "default_params_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "provider_config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "pricing_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "limits_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ui_config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "remark" text,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "ai_model_dispatch_policies" (
  "id" uuid NOT NULL,
  "model_config_id" uuid NOT NULL,
  "queue_backend" text DEFAULT 'bullmq'::text NOT NULL,
  "submit_queue_name" text NOT NULL,
  "poll_queue_name" text,
  "finalize_queue_name" text,
  "dead_letter_queue_name" text DEFAULT 'generation-dead-letter'::text NOT NULL,
  "job_id_template" text DEFAULT 'generation:{stage}:{taskId}'::text NOT NULL,
  "bullmq_job_options_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "submit_concurrency_limit" integer DEFAULT 5 NOT NULL,
  "provider_rpm_limit" integer DEFAULT 60 NOT NULL,
  "provider_concurrent_limit" integer DEFAULT 5 NOT NULL,
  "polling_interval_ms" integer DEFAULT 15000 NOT NULL,
  "polling_concurrency_limit" integer DEFAULT 20 NOT NULL,
  "polling_backoff_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "retry_policy_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "circuit_breaker_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "generation_queue_routes" (
  "route_key" text NOT NULL,
  "route_code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "generation_queue_shards" (
  "id" uuid NOT NULL,
  "media_type" text NOT NULL,
  "stage" text NOT NULL,
  "route_key" text NOT NULL,
  "route_code" text NOT NULL,
  "shard_no" integer NOT NULL,
  "queue_name" text NOT NULL,
  "capacity" integer DEFAULT 600 NOT NULL,
  "rate_limit_max" integer DEFAULT 5 NOT NULL,
  "rate_limit_duration_ms" integer DEFAULT 1000 NOT NULL,
  "admitted_count" integer DEFAULT 0 NOT NULL,
  "state" text DEFAULT 'accepting'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "generation_queue_stage_assignments" (
  "assignment_key" text NOT NULL,
  "task_id" uuid NOT NULL,
  "media_type" text NOT NULL,
  "stage" text NOT NULL,
  "route_key" text NOT NULL,
  "shard_id" uuid NOT NULL,
  "status" text DEFAULT 'admitted'::text NOT NULL,
  "admitted_at" timestamp with time zone NOT NULL,
  "released_at" timestamp with time zone,
  "release_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "generation_stage_successors" (
  "id" uuid NOT NULL,
  "task_id" uuid NOT NULL,
  "stage" text NOT NULL,
  "poll_attempt" integer DEFAULT 0 NOT NULL,
  "skip_reason" text NOT NULL,
  "next_action" text NOT NULL,
  "status" text DEFAULT 'scheduled'::text NOT NULL,
  "successor_assignment_key" text,
  "first_observed_at" timestamp with time zone NOT NULL,
  "last_observed_at" timestamp with time zone NOT NULL,
  "confirmed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "announcements" (
  "id" uuid NOT NULL,
  "title" text NOT NULL,
  "summary" text DEFAULT ''::text NOT NULL,
  "body" text DEFAULT ''::text NOT NULL,
  "action_label" text DEFAULT ''::text NOT NULL,
  "action_url" text DEFAULT ''::text NOT NULL,
  "status" text NOT NULL,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "app_schema_migrations" (
  "migration_name" text NOT NULL,
  "checksum" text NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "asset_review_candidates" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "candidate_group" text NOT NULL,
  "asset_key" text NOT NULL,
  "label" text NOT NULL,
  "required" boolean DEFAULT true NOT NULL,
  "confirmed" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "asset_versions" (
  "id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "storage_object_key" text NOT NULL,
  "metadata_json" jsonb NOT NULL,
  "source_task_id" uuid,
  "source_attempt_id" uuid,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "storage_object_id" uuid
);

CREATE TABLE IF NOT EXISTS "assets" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "asset_type" text NOT NULL,
  "asset_key" text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "audit_events" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "actor_user_id" uuid,
  "event_type" text NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "reason" text,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid,
  "actor_admin_account_id" uuid
);

CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "status" text NOT NULL,
  "session_token_hash" text NOT NULL,
  "session_token_hash_version" integer DEFAULT 1 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "billing_orders" (
  "id" uuid NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "order_no" text NOT NULL,
  "credit_package_id" uuid,
  "package_snapshot_json" jsonb NOT NULL,
  "credits" integer NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text NOT NULL,
  "status" text NOT NULL,
  "idempotency_record_id" uuid,
  "idempotency_key" text,
  "expires_at" timestamp with time zone NOT NULL,
  "paid_at" timestamp with time zone,
  "successful_payment_intent_id" uuid,
  "credit_grant_ledger_entry_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "product_type" text DEFAULT 'credit_package'::text NOT NULL,
  "membership_plan_id" uuid,
  "product_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "calibration_items" (
  "id" uuid NOT NULL,
  "calibration_session_id" uuid NOT NULL,
  "shot_id" uuid NOT NULL,
  "status" text NOT NULL,
  "quality_review_result" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "calibration_sessions" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "status" text NOT NULL,
  "decision_type" text,
  "decision_reason" text,
  "decided_by_user_id" uuid,
  "decided_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "character_prompt_templates" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "stage" text NOT NULL,
  "model_family" text DEFAULT 'general'::text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "chunk_min_chars" integer DEFAULT 0 NOT NULL,
  "chunk_max_chars" integer DEFAULT 0 NOT NULL,
  "overlap_chars" integer DEFAULT 0 NOT NULL,
  "json_schema" text,
  "prompt_content" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'enabled'::text NOT NULL,
  "remark" text,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "creator_canvas_documents" (
  "id" uuid NOT NULL,
  "canvas_project_id" uuid NOT NULL,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "server_revision" integer DEFAULT 1 NOT NULL,
  "document_json" jsonb NOT NULL,
  "x6_graph_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "viewport_json" jsonb DEFAULT '{"x": 0, "y": 0, "zoom": 1}'::jsonb NOT NULL,
  "node_count" integer DEFAULT 0 NOT NULL,
  "edge_count" integer DEFAULT 0 NOT NULL,
  "content_hash" text,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "creator_canvas_edges" (
  "id" uuid NOT NULL,
  "canvas_project_id" uuid NOT NULL,
  "edge_key" text NOT NULL,
  "source_node_key" text NOT NULL,
  "source_port_id" text NOT NULL,
  "target_node_key" text NOT NULL,
  "target_port_id" text NOT NULL,
  "edge_kind" text DEFAULT 'any'::text NOT NULL,
  "status" text DEFAULT 'idle'::text NOT NULL,
  "router_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "data_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "creator_canvas_events" (
  "id" uuid NOT NULL,
  "canvas_project_id" uuid NOT NULL,
  "server_revision" integer NOT NULL,
  "event_type" text NOT NULL,
  "target_type" text NOT NULL,
  "target_key" text,
  "patch_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "actor_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "creator_canvas_node_artifacts" (
  "id" uuid NOT NULL,
  "canvas_project_id" uuid NOT NULL,
  "node_key" text NOT NULL,
  "run_id" uuid,
  "artifact_kind" text NOT NULL,
  "asset_id" uuid,
  "asset_version_id" uuid,
  "storage_object_id" uuid,
  "url" text,
  "thumbnail_url" text,
  "selected" boolean DEFAULT false NOT NULL,
  "selection_role" text DEFAULT 'current'::text NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "creator_canvas_node_runs" (
  "id" uuid NOT NULL,
  "canvas_project_id" uuid NOT NULL,
  "node_key" text NOT NULL,
  "run_no" integer NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text NOT NULL,
  "media_kind" text NOT NULL,
  "model_code" text,
  "target_type" text,
  "target_id" text,
  "composed_prompt_hash" text,
  "input_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "task_id" uuid,
  "attempt_id" uuid,
  "provider_request_id" uuid,
  "generation_snapshot_id" uuid,
  "failure_json" jsonb,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "creator_canvas_nodes" (
  "id" uuid NOT NULL,
  "canvas_project_id" uuid NOT NULL,
  "node_key" text NOT NULL,
  "node_type" text NOT NULL,
  "title" text DEFAULT ''::text NOT NULL,
  "status" text DEFAULT 'idle'::text NOT NULL,
  "media_kind" text,
  "source_kind" text,
  "model_code" text,
  "position_x" numeric DEFAULT 0 NOT NULL,
  "position_y" numeric DEFAULT 0 NOT NULL,
  "width" numeric DEFAULT 360 NOT NULL,
  "height" numeric DEFAULT 240 NOT NULL,
  "z_index" integer DEFAULT 0 NOT NULL,
  "group_key" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "port_schema_json" jsonb DEFAULT '{"inputs": [], "outputs": []}'::jsonb NOT NULL,
  "data_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "runtime_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "deleted_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "creator_canvas_projects" (
  "id" uuid NOT NULL,
  "title" text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "server_revision" integer DEFAULT 1 NOT NULL,
  "latest_document_id" uuid,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "creator_canvas_revisions" (
  "id" uuid NOT NULL,
  "canvas_project_id" uuid NOT NULL,
  "server_revision" integer NOT NULL,
  "operation" text NOT NULL,
  "document_json" jsonb NOT NULL,
  "summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "creator_canvas_sessions" (
  "id" uuid NOT NULL,
  "canvas_project_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "viewport_json" jsonb DEFAULT '{"x": 0, "y": 0, "zoom": 1}'::jsonb NOT NULL,
  "selected_node_keys_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "selected_edge_keys_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ui_state_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "last_seen_revision" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "credit_ledger_entries" (
  "id" uuid NOT NULL,
  "reservation_id" uuid,
  "allocation_id" uuid,
  "entry_type" text NOT NULL,
  "amount" integer NOT NULL,
  "available_delta" integer NOT NULL,
  "reserved_delta" integer NOT NULL,
  "consumed_delta" integer NOT NULL,
  "balance_after" integer,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL,
  "team_member_id" uuid
);

CREATE TABLE IF NOT EXISTS "credit_lots" (
  "id" uuid NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "grant_ledger_entry_id" uuid NOT NULL,
  "total_amount" integer NOT NULL,
  "available_amount" integer DEFAULT 0 NOT NULL,
  "reserved_amount" integer DEFAULT 0 NOT NULL,
  "consumed_amount" integer DEFAULT 0 NOT NULL,
  "expired_amount" integer DEFAULT 0 NOT NULL,
  "expires_at" timestamp with time zone,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "frozen_at" timestamp with time zone,
  "frozen_until" timestamp with time zone,
  "user_id" uuid NOT NULL
);

COMMENT ON COLUMN credit_ledger_entries.balance_after IS 'Available balance after this ledger entry; NULL only when legacy history cannot be reconstructed reliably.';

CREATE TABLE IF NOT EXISTS "credit_packages" (
  "id" uuid NOT NULL,
  "code" text NOT NULL,
  "display_name" text NOT NULL,
  "credits" integer NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text NOT NULL,
  "status" text NOT NULL,
  "valid_from" timestamp with time zone,
  "valid_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "subtitle" text,
  "gift_credits" integer DEFAULT 0 NOT NULL,
  "badge" text,
  "sort_order" integer DEFAULT 100 NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS "credit_reservation_allocations" (
  "id" uuid NOT NULL,
  "reservation_id" uuid NOT NULL,
  "task_id" uuid,
  "attempt_id" uuid,
  "provider_request_id" uuid,
  "allocation_key" text NOT NULL,
  "amount" integer NOT NULL,
  "status" text NOT NULL,
  "settled_ledger_entry_id" uuid,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "credit_reservation_lot_allocations" (
  "id" uuid NOT NULL,
  "reservation_id" uuid NOT NULL,
  "credit_lot_id" uuid NOT NULL,
  "amount" integer NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "credit_reservations" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "workflow_id" uuid,
  "task_id" uuid,
  "amount_total" integer NOT NULL,
  "amount_reserved" integer NOT NULL,
  "amount_consumed" integer DEFAULT 0 NOT NULL,
  "amount_released" integer DEFAULT 0 NOT NULL,
  "status" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "credit_wallet_transfers" (
  "id" uuid NOT NULL,
  "operator_user_id" uuid NOT NULL,
  "amount" integer NOT NULL,
  "status" text NOT NULL,
  "source_ledger_entry_id" uuid,
  "target_ledger_entry_id" uuid,
  "idempotency_key" text NOT NULL,
  "failure_code" text,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_user_id" uuid NOT NULL,
  "target_team_member_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "episode_asset_conversation_messages" (
  "id" uuid NOT NULL,
  "thread_id" uuid NOT NULL,
  "turn_id" text NOT NULL,
  "message_key" text NOT NULL,
  "message_type" text NOT NULL,
  "status" text DEFAULT 'running'::text NOT NULL,
  "task_id" text,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "episode_asset_conversation_threads" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "episode_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "media_mode" text NOT NULL,
  "latest_message_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "episode_generation_drafts" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "episode_id" uuid NOT NULL,
  "target_type" text NOT NULL,
  "target_id" uuid NOT NULL,
  "prompt" text DEFAULT ''::text NOT NULL,
  "mode" text DEFAULT 'image'::text NOT NULL,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "episodes" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "title" text NOT NULL,
  "sequence" integer NOT NULL,
  "status" text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "export_records" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "workflow_id" uuid NOT NULL,
  "storage_object_id" uuid NOT NULL,
  "manifest_status" text NOT NULL,
  "allow_partial_export" boolean DEFAULT false NOT NULL,
  "item_count" integer NOT NULL,
  "missing_asset_count" integer NOT NULL,
  "latest_signed_url_expires_at" timestamp with time zone NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "episode_id" uuid
);

CREATE TABLE IF NOT EXISTS "idempotency_records" (
  "id" uuid NOT NULL,
  "operation_name" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "response_resource_type" text,
  "response_resource_id" uuid,
  "status" text DEFAULT 'processing'::text NOT NULL,
  "response_snapshot_json" jsonb,
  "failure_code" text,
  "expires_at" timestamp with time zone NOT NULL,
  "locked_until" timestamp with time zone,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid,
  "admin_account_id" uuid,
  "scope_key" text NOT NULL
);

CREATE TABLE IF NOT EXISTS "image_prompt_styles" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "category" text DEFAULT 'official'::text NOT NULL,
  "model_family" text DEFAULT 'doubao'::text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "prompt_content" text NOT NULL,
  "negative_prompt" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'enabled'::text NOT NULL,
  "remark" text,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "cover_image_url" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "batch_preset_target" text
);

CREATE TABLE IF NOT EXISTS "inbox_events" (
  "id" uuid NOT NULL,
  "consumer_name" text NOT NULL,
  "outbox_event_id" uuid NOT NULL,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invite_reward_configs" (
  "id" uuid NOT NULL,
  "status" text NOT NULL,
  "new_user_plan_id" uuid,
  "new_user_gift_credits" integer DEFAULT 0 NOT NULL,
  "inviter_plan_id" uuid,
  "inviter_gift_credits" integer DEFAULT 0 NOT NULL,
  "rebate_percent" numeric(6,3) DEFAULT 3.000 NOT NULL,
  "rebate_window_days" integer DEFAULT 30 NOT NULL,
  "rebate_credit_rate" integer DEFAULT 100 NOT NULL,
  "per_invited_user_rebate_cap_minor" integer,
  "per_inviter_period_rebate_cap_minor" integer,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "invite_reward_grants" (
  "id" uuid NOT NULL,
  "binding_id" uuid NOT NULL,
  "recipient_user_id" uuid NOT NULL,
  "reward_type" text NOT NULL,
  "source_type" text NOT NULL,
  "source_id" uuid NOT NULL,
  "membership_period_id" uuid,
  "credit_ledger_entry_id" uuid,
  "amount_minor" integer,
  "credits" integer DEFAULT 0 NOT NULL,
  "status" text NOT NULL,
  "reason" text,
  "config_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "library_asset_versions" (
  "id" uuid NOT NULL,
  "library_asset_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "storage_object_key" text NOT NULL,
  "preview_url" text,
  "mime_type" text NOT NULL,
  "width" integer NOT NULL,
  "height" integer NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "library_assets" (
  "id" uuid NOT NULL,
  "scope" text NOT NULL,
  "created_by_user_id" uuid,
  "asset_type" text NOT NULL,
  "category" text NOT NULL,
  "folder" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "tags_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text NOT NULL,
  "requires_pro_entitlement" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "owner_user_id" uuid
);

CREATE TABLE IF NOT EXISTS "login_challenges" (
  "id" uuid NOT NULL,
  "phone_e164" text NOT NULL,
  "code_hash" text NOT NULL,
  "code_hash_version" integer DEFAULT 1 NOT NULL,
  "status" text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 5 NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_sent_at" timestamp with time zone NOT NULL,
  "consumed_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_ip_hash" text,
  "created_user_agent_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "membership_periods" (
  "id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "plan_id" uuid NOT NULL,
  "tier" text NOT NULL,
  "period_start_at" timestamp with time zone NOT NULL,
  "period_end_at" timestamp with time zone NOT NULL,
  "gift_credits" integer DEFAULT 0 NOT NULL,
  "plan_snapshot_json" jsonb NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "membership_plan_revisions" (
  "id" uuid NOT NULL,
  "plan_id" uuid NOT NULL,
  "snapshot_json" jsonb NOT NULL,
  "changed_by_admin_id" uuid,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "membership_plans" (
  "id" uuid NOT NULL,
  "code" text NOT NULL,
  "display_name" text NOT NULL,
  "tier" text NOT NULL,
  "period_unit" text NOT NULL,
  "period_count" integer NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'CNY'::text NOT NULL,
  "gift_credits" integer DEFAULT 0 NOT NULL,
  "seat_limit" integer DEFAULT 1 NOT NULL,
  "entitlements_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "priority_rules_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "display_metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text NOT NULL,
  "valid_from" timestamp with time zone,
  "valid_until" timestamp with time zone,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "visibility" text DEFAULT 'public'::text NOT NULL,
  "usage_scene" text DEFAULT 'purchase'::text NOT NULL
);

CREATE TABLE IF NOT EXISTS "membership_reminders" (
  "id" uuid NOT NULL,
  "membership_period_id" uuid NOT NULL,
  "reminder_key" text NOT NULL,
  "remind_at" timestamp with time zone NOT NULL,
  "delivered_at" timestamp with time zone,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "outbox_events" (
  "id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload_json" jsonb NOT NULL,
  "generation_stage" text,
  "provider_route_key" text,
  "provider_config_revision_id" text,
  "credential_version_ref" text,
  "status" text NOT NULL,
  "available_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "error_message" text,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "dedupe_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "user_id" uuid
);

CREATE TABLE IF NOT EXISTS "payment_intents" (
  "id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "product_mode" text NOT NULL,
  "status" text NOT NULL,
  "amount_minor" integer NOT NULL,
  "currency" text NOT NULL,
  "merchant_order_no" text NOT NULL,
  "provider_trade_id" text,
  "provider_payload_hash" text NOT NULL,
  "provider_safe_metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "submitted_at" timestamp with time zone,
  "succeeded_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "idempotency_record_id" uuid,
  "idempotency_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payment_logs" (
  "id" uuid NOT NULL,
  "user_id" uuid,
  "order_id" uuid,
  "payment_intent_id" uuid,
  "provider_event_id" uuid,
  "provider" text NOT NULL,
  "merchant_order_no" text NOT NULL,
  "provider_trade_id" text,
  "recharge_title" text,
  "recharge_description" text,
  "amount_minor" integer NOT NULL,
  "currency" text DEFAULT 'CNY'::text NOT NULL,
  "request_time" timestamp with time zone NOT NULL,
  "request_params_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "request_headers_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "callback_time" timestamp with time zone,
  "callback_params_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "callback_headers_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "callback_count" integer DEFAULT 0 NOT NULL,
  "success" boolean DEFAULT false NOT NULL,
  "processing_status" text,
  "failure_code" text,
  "event_type" text,
  "provider_event_dedup_key" text,
  "signature_status" text,
  "raw_request_hash" text,
  "raw_callback_hash" text,
  "callback_result_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "extra_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payment_provider_events" (
  "id" uuid NOT NULL,
  "order_id" uuid,
  "payment_intent_id" uuid,
  "provider" text NOT NULL,
  "provider_event_dedup_key" text NOT NULL,
  "merchant_order_no" text,
  "provider_trade_id" text,
  "event_type" text NOT NULL,
  "signature_status" text NOT NULL,
  "processing_status" text NOT NULL,
  "raw_payload_hash" text NOT NULL,
  "normalized_payload_json" jsonb,
  "ack_status" text,
  "failure_code" text,
  "received_at" timestamp with time zone NOT NULL,
  "processed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payment_reconciliation_items" (
  "id" uuid NOT NULL,
  "run_id" uuid,
  "order_id" uuid,
  "payment_intent_id" uuid,
  "provider_trade_id" text,
  "issue_type" text NOT NULL,
  "status" text NOT NULL,
  "resolution_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payment_reconciliation_runs" (
  "id" uuid NOT NULL,
  "provider" text NOT NULL,
  "run_type" text NOT NULL,
  "status" text NOT NULL,
  "summary_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "finished_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "payment_risk_events" (
  "id" uuid NOT NULL,
  "user_id" uuid,
  "order_id" uuid,
  "payment_intent_id" uuid,
  "provider_event_id" uuid,
  "risk_type" text NOT NULL,
  "severity" text NOT NULL,
  "decision" text NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "reviewed_by_user_id" uuid,
  "reviewed_at" timestamp with time zone,
  "review_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "reviewed_by_admin_account_id" uuid
);

CREATE TABLE IF NOT EXISTS "project_upload_records" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "storage_object_id" uuid,
  "upload_session_id" uuid,
  "actor_user_id" uuid,
  "actor_display_name" text,
  "actor_phone_e164" text,
  "project_name" text,
  "page_key" text NOT NULL,
  "page_url" text,
  "source_action" text NOT NULL,
  "file_name" text NOT NULL,
  "object_key" text,
  "bucket" text,
  "provider" text,
  "content_type" text,
  "size_bytes" bigint,
  "public_url" text,
  "status" text NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "project_source_documents" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "status" text NOT NULL,
  "input_text" text NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "resource_decoupling_audit" (
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "legacy_links_json" jsonb NOT NULL,
  "recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "projects" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "cover_image_url" text,
  "aspect_ratio" text NOT NULL,
  "resolution" text NOT NULL,
  "project_style_code" text DEFAULT 'animation'::text NOT NULL,
  "phase" text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cover_storage_object_id" uuid,
  "owner_user_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "prop_prompt_templates" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "stage" text NOT NULL,
  "model_family" text DEFAULT 'general'::text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "json_schema" text DEFAULT ''::text NOT NULL,
  "prompt_content" text NOT NULL,
  "negative_prompt" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'enabled'::text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "remark" text,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "provider_requests" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "workflow_id" uuid,
  "task_id" uuid,
  "attempt_id" uuid,
  "provider_name" text NOT NULL,
  "provider_operation" text NOT NULL,
  "request_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "payload_ref" text NOT NULL,
  "payload_hash" text NOT NULL,
  "payload_redacted_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "provider_config_revision_id" text,
  "credential_version_ref" text,
  "status" text NOT NULL,
  "external_submission_started_at" timestamp with time zone,
  "external_request_id" text,
  "response_redacted_json" jsonb,
  "failure_code" text,
  "next_poll_at" timestamp with time zone,
  "poll_deadline_at" timestamp with time zone,
  "poll_sequence" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "provider_webhook_inbox" (
  "id" uuid NOT NULL,
  "provider_name" text NOT NULL,
  "event_key" text NOT NULL,
  "external_request_id" text NOT NULL,
  "payload_hash" text NOT NULL,
  "payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'received'::text NOT NULL,
  "error_message" text,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "runtime_config_entries" (
  "key" text NOT NULL,
  "value_json" jsonb NOT NULL,
  "value_type" text NOT NULL,
  "scope" text DEFAULT 'global'::text NOT NULL,
  "description" text,
  "updated_by_admin_id" uuid,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "runtime_config_revisions" (
  "id" uuid NOT NULL,
  "config_key" text NOT NULL,
  "previous_value_json" jsonb,
  "next_value_json" jsonb NOT NULL,
  "changed_by_admin_id" uuid,
  "reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "scene_prompt_templates" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "stage" text NOT NULL,
  "model_family" text DEFAULT 'general'::text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "json_schema" text DEFAULT ''::text NOT NULL,
  "prompt_content" text NOT NULL,
  "negative_prompt" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'enabled'::text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "remark" text,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "script_reader_sections" (
  "id" uuid NOT NULL,
  "script_id" uuid NOT NULL,
  "title" text NOT NULL,
  "body" text DEFAULT ''::text NOT NULL,
  "sequence" integer NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "scripts" (
  "id" uuid NOT NULL,
  "owner_user_id" uuid NOT NULL,
  "status" text NOT NULL,
  "input_text" text NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "title" text,
  "cover_image_url" text,
  "cover_storage_object_id" uuid,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "shot_prompt_templates" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "stage" text NOT NULL,
  "model_family" text DEFAULT 'general'::text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "variables" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "json_schema" text DEFAULT ''::text NOT NULL,
  "prompt_content" text NOT NULL,
  "negative_prompt" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'enabled'::text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "remark" text,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "shot_reference_assets" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "shot_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "asset_version_id" uuid,
  "reference_role" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "shots" (
  "id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "episode_id" uuid,
  "title" text NOT NULL,
  "description" text DEFAULT ''::text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "content_revision" integer DEFAULT 1 NOT NULL,
  "content_status" text NOT NULL,
  "image_status" text NOT NULL,
  "video_status" text NOT NULL,
  "current_image_asset_version_id" uuid,
  "active_image_task_id" uuid,
  "active_image_revision" integer,
  "current_video_asset_version_id" uuid,
  "active_video_task_id" uuid,
  "active_video_image_asset_version_id" uuid,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "scene_analysis" text DEFAULT ''::text NOT NULL,
  "plot_preview" text DEFAULT ''::text NOT NULL,
  "prompt_draft" text DEFAULT ''::text NOT NULL,
  "tts_draft" text DEFAULT ''::text NOT NULL
);

CREATE TABLE IF NOT EXISTS "sms_send_records" (
  "id" uuid NOT NULL,
  "phone_e164" text NOT NULL,
  "challenge_id" uuid,
  "provider" text NOT NULL,
  "status" text NOT NULL,
  "ip_address_hash" text,
  "user_agent_hash" text,
  "provider_request_id" text,
  "error_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "verification_code" text,
  "sms_content" text,
  "ip_address" text
);

CREATE TABLE IF NOT EXISTS "storage_objects" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "bucket" text NOT NULL,
  "object_key" text NOT NULL,
  "content_type" text NOT NULL,
  "size_bytes" bigint,
  "checksum" text,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "provider" text DEFAULT 'legacy'::text NOT NULL,
  "status" text DEFAULT 'available'::text NOT NULL,
  "etag" text,
  "version_id" text,
  "last_verified_at" timestamp with time zone,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "storage_upload_sessions" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "storage_object_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "status" text NOT NULL,
  "content_type" text NOT NULL,
  "expected_size_bytes" bigint,
  "original_file_name" text NOT NULL,
  "checksum" text,
  "idempotency_key" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "storyboard_prompt_package_versions" (
  "id" uuid NOT NULL,
  "package_id" uuid NOT NULL,
  "version_no" integer NOT NULL,
  "snapshot_json" jsonb NOT NULL,
  "change_reason" text,
  "created_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "storyboard_prompt_packages" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "package_type" text NOT NULL,
  "audience" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "prompt_content" text NOT NULL,
  "key_points" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "negative_prompt" text,
  "applicable_genres" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "applicable_scene" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "output_type" text,
  "scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "can_stack" boolean DEFAULT true NOT NULL,
  "max_select_count" integer,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_global_default" boolean DEFAULT false NOT NULL,
  "is_recommended" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'enabled'::text NOT NULL,
  "remark" text,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  "cover_image_url" text
);

CREATE TABLE IF NOT EXISTS "storyboard_prompt_templates" (
  "id" uuid NOT NULL,
  "name" text NOT NULL,
  "code" text NOT NULL,
  "base_prompt" text NOT NULL,
  "genre_package_id" uuid NOT NULL,
  "emotion_package_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "camera_package_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "output_package_id" uuid,
  "taboo_package_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'enabled'::text NOT NULL,
  "remark" text,
  "created_by_admin_id" uuid,
  "updated_by_admin_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE TABLE IF NOT EXISTS "task_attempts" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "workflow_id" uuid NOT NULL,
  "task_id" uuid NOT NULL,
  "attempt_number" integer NOT NULL,
  "status" text NOT NULL,
  "locked_by" text,
  "locked_until" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "workflow_id" uuid NOT NULL,
  "task_type" text NOT NULL,
  "status" text NOT NULL,
  "idempotency_record_id" uuid,
  "idempotency_key" text,
  "queue_name" text NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "scheduled_at" timestamp with time zone DEFAULT now() NOT NULL,
  "last_dispatched_at" timestamp with time zone,
  "locked_by" text,
  "locked_until" timestamp with time zone,
  "heartbeat_at" timestamp with time zone,
  "current_attempt_id" uuid,
  "input_snapshot_json" jsonb NOT NULL,
  "target_entity_type" text NOT NULL,
  "target_entity_id" uuid NOT NULL,
  "max_attempts" integer DEFAULT 1 NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "failure_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "team_assets" (
  "id" uuid NOT NULL,
  "admin_user_id" uuid NOT NULL,
  "asset_name" text NOT NULL,
  "asset_prompt" text,
  "asset_category" text NOT NULL,
  "asset_status" text NOT NULL,
  "asset_url" text,
  "resource_type" text NOT NULL,
  "resource_size" bigint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by_name" text NOT NULL,
  "updated_by_name" text NOT NULL,
  "is_admin_created" boolean DEFAULT true NOT NULL,
  "created_user_id" uuid NOT NULL
);

CREATE TABLE IF NOT EXISTS "team_member_auth_sessions" (
  "id" uuid NOT NULL,
  "auth_session_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "status" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "team_member_canvases" (
  "id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "canvas_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "team_member_project_records" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "record_type" text NOT NULL,
  "record_status" text DEFAULT 'recorded'::text NOT NULL,
  "record_title" text NOT NULL,
  "record_detail_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_table" text,
  "source_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "team_member_projects" (
  "id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "project_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "role" text DEFAULT 'creator'::text NOT NULL,
  "note" text
);

CREATE TABLE IF NOT EXISTS "team_member_scripts" (
  "id" uuid NOT NULL,
  "member_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "script_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "team_members" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "member_account" text NOT NULL,
  "member_account_suffix" text NOT NULL,
  "member_login_account" text NOT NULL,
  "member_name" text NOT NULL,
  "member_password_hash" text NOT NULL,
  "member_credits" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "disabled_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_entitlements" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "entitlement_key" text NOT NULL,
  "status" text NOT NULL,
  "source" text NOT NULL,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_invite_bindings" (
  "id" uuid NOT NULL,
  "invited_user_id" uuid NOT NULL,
  "inviter_user_id" uuid NOT NULL,
  "invite_code" text NOT NULL,
  "bound_at" timestamp with time zone DEFAULT now() NOT NULL,
  "rebate_valid_until" timestamp with time zone NOT NULL,
  "status" text NOT NULL,
  "config_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_memberships" (
  "id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "membership_tier" text NOT NULL,
  "purchase_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "gift_credits" integer DEFAULT 0 NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "user_model_request_logs" (
  "id" uuid NOT NULL,
  "provider_request_id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "workflow_id" uuid,
  "task_id" uuid,
  "attempt_id" uuid,
  "user_id" uuid,
  "provider_name" text NOT NULL,
  "provider_operation" text NOT NULL,
  "model_id" text NOT NULL,
  "provider_model" text NOT NULL,
  "request_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "payload_hash" text NOT NULL,
  "payload_summary" text,
  "request_format" text DEFAULT 'openai_chat_completions'::text NOT NULL,
  "request_body_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "request_text" text,
  "response_text" text,
  "response_usage_json" jsonb,
  "response_finish_reasons_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text NOT NULL,
  "failure_code" text,
  "started_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid NOT NULL,
  "email" text,
  "phone_e164" text,
  "display_name" text,
  "password_hash" text,
  "status" text NOT NULL,
  "last_login_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "wechat_app_id" text,
  "wechat_openid" text,
  "wechat_unionid" text,
  "wechat_nickname" text,
  "wechat_avatar_url" text,
  "wechat_last_login_at" timestamp with time zone,
  "invite_code" text DEFAULT generate_user_invite_code() NOT NULL,
  "credit_balance_cached" integer DEFAULT 0 NOT NULL,
  "credit_reserved_cached" integer DEFAULT 0 NOT NULL,
  "credit_frozen_cached" integer DEFAULT 0 NOT NULL,
  "credit_frozen_at" timestamp with time zone,
  "credit_frozen_until" timestamp with time zone,
  "team_account_suffix" text,
  "team_seat_limit" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "workflows" (
  "id" uuid NOT NULL,
  "project_id" uuid,
  "canvas_project_id" uuid,
  "workflow_type" text NOT NULL,
  "status" text NOT NULL,
  "idempotency_record_id" uuid,
  "idempotency_key" text,
  "input_snapshot_json" jsonb NOT NULL,
  "created_by_user_id" uuid,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "failure_code" text,
  "failure_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "admin_account_roles" ADD CONSTRAINT "admin_account_roles_pkey" PRIMARY KEY (id);

ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_pkey" PRIMARY KEY (id);

ALTER TABLE "admin_auth_sessions" ADD CONSTRAINT "admin_auth_sessions_pkey" PRIMARY KEY (id);

ALTER TABLE "admin_secret_references" ADD CONSTRAINT "admin_secret_references_pkey" PRIMARY KEY (id);

ALTER TABLE "admin_secret_values" ADD CONSTRAINT "admin_secret_values_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "ai_generation_task_snapshots_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_pkey" PRIMARY KEY (id);

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_pkey" PRIMARY KEY (id);

ALTER TABLE "generation_queue_routes" ADD CONSTRAINT "generation_queue_routes_pkey" PRIMARY KEY (route_key);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_pkey" PRIMARY KEY (id);

ALTER TABLE "generation_queue_stage_assignments" ADD CONSTRAINT "generation_queue_stage_assignments_pkey" PRIMARY KEY (assignment_key);

ALTER TABLE "generation_stage_successors" ADD CONSTRAINT "generation_stage_successors_pkey" PRIMARY KEY (id);

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_pkey" PRIMARY KEY (id);

ALTER TABLE "app_schema_migrations" ADD CONSTRAINT "app_schema_migrations_pkey" PRIMARY KEY (migration_name);

ALTER TABLE "asset_review_candidates" ADD CONSTRAINT "asset_review_candidates_pkey" PRIMARY KEY (id);

ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_pkey" PRIMARY KEY (id);

ALTER TABLE "assets" ADD CONSTRAINT "assets_pkey" PRIMARY KEY (id);

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_pkey" PRIMARY KEY (id);

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_pkey" PRIMARY KEY (id);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_pkey" PRIMARY KEY (id);

ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_pkey" PRIMARY KEY (id);

ALTER TABLE "calibration_sessions" ADD CONSTRAINT "calibration_sessions_pkey" PRIMARY KEY (id);

ALTER TABLE "character_prompt_templates" ADD CONSTRAINT "character_prompt_templates_pkey" PRIMARY KEY (id);

ALTER TABLE "creator_canvas_documents" ADD CONSTRAINT "creator_canvas_documents_pkey" PRIMARY KEY (id);

ALTER TABLE "creator_canvas_edges" ADD CONSTRAINT "creator_canvas_edges_pkey" PRIMARY KEY (id);

ALTER TABLE "creator_canvas_events" ADD CONSTRAINT "creator_canvas_events_pkey" PRIMARY KEY (id);

ALTER TABLE "creator_canvas_node_artifacts" ADD CONSTRAINT "creator_canvas_node_artifacts_pkey" PRIMARY KEY (id);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_pkey" PRIMARY KEY (id);

ALTER TABLE "creator_canvas_nodes" ADD CONSTRAINT "creator_canvas_nodes_pkey" PRIMARY KEY (id);

ALTER TABLE "creator_canvas_projects" ADD CONSTRAINT "creator_canvas_projects_pkey" PRIMARY KEY (id);

ALTER TABLE "creator_canvas_revisions" ADD CONSTRAINT "creator_canvas_revisions_pkey" PRIMARY KEY (id);

ALTER TABLE "creator_canvas_sessions" ADD CONSTRAINT "creator_canvas_sessions_pkey" PRIMARY KEY (id);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_pkey" PRIMARY KEY (id);

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_pkey" PRIMARY KEY (id);

ALTER TABLE "credit_packages" ADD CONSTRAINT "credit_packages_pkey" PRIMARY KEY (id);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_pkey" PRIMARY KEY (id);

ALTER TABLE "credit_reservation_lot_allocations" ADD CONSTRAINT "credit_reservation_lot_allocations_pkey" PRIMARY KEY (id);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_pkey" PRIMARY KEY (id);

ALTER TABLE "credit_wallet_transfers" ADD CONSTRAINT "credit_wallet_transfers_pkey" PRIMARY KEY (id);

ALTER TABLE "episode_asset_conversation_messages" ADD CONSTRAINT "episode_asset_conversation_messages_pkey" PRIMARY KEY (id);

ALTER TABLE "episode_asset_conversation_threads" ADD CONSTRAINT "episode_asset_conversation_threads_pkey" PRIMARY KEY (id);

ALTER TABLE "episode_generation_drafts" ADD CONSTRAINT "episode_generation_drafts_pkey" PRIMARY KEY (id);

ALTER TABLE "episodes" ADD CONSTRAINT "episodes_pkey" PRIMARY KEY (id);

ALTER TABLE "export_records" ADD CONSTRAINT "export_records_pkey" PRIMARY KEY (id);

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_pkey" PRIMARY KEY (id);

ALTER TABLE "image_prompt_styles" ADD CONSTRAINT "image_prompt_styles_pkey" PRIMARY KEY (id);

ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_pkey" PRIMARY KEY (id);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_pkey" PRIMARY KEY (id);

ALTER TABLE "invite_reward_grants" ADD CONSTRAINT "invite_reward_grants_pkey" PRIMARY KEY (id);

ALTER TABLE "library_asset_versions" ADD CONSTRAINT "library_asset_versions_pkey" PRIMARY KEY (id);

ALTER TABLE "library_assets" ADD CONSTRAINT "library_assets_pkey" PRIMARY KEY (id);

ALTER TABLE "login_challenges" ADD CONSTRAINT "login_challenges_pkey" PRIMARY KEY (id);

ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_pkey" PRIMARY KEY (id);

ALTER TABLE "membership_plan_revisions" ADD CONSTRAINT "membership_plan_revisions_pkey" PRIMARY KEY (id);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_pkey" PRIMARY KEY (id);

ALTER TABLE "membership_reminders" ADD CONSTRAINT "membership_reminders_pkey" PRIMARY KEY (id);

ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_pkey" PRIMARY KEY (id);

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_pkey" PRIMARY KEY (id);

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_pkey" PRIMARY KEY (id);

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_pkey" PRIMARY KEY (id);

ALTER TABLE "payment_reconciliation_items" ADD CONSTRAINT "payment_reconciliation_items_pkey" PRIMARY KEY (id);

ALTER TABLE "payment_reconciliation_runs" ADD CONSTRAINT "payment_reconciliation_runs_pkey" PRIMARY KEY (id);

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_pkey" PRIMARY KEY (id);

ALTER TABLE "project_upload_records" ADD CONSTRAINT "project_upload_records_pkey" PRIMARY KEY (id);

ALTER TABLE "project_source_documents" ADD CONSTRAINT "project_source_documents_pkey" PRIMARY KEY (id);

ALTER TABLE "resource_decoupling_audit" ADD CONSTRAINT "resource_decoupling_audit_pkey" PRIMARY KEY (entity_type, entity_id);

ALTER TABLE "projects" ADD CONSTRAINT "projects_pkey" PRIMARY KEY (id);

ALTER TABLE "prop_prompt_templates" ADD CONSTRAINT "prop_prompt_templates_pkey" PRIMARY KEY (id);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_pkey" PRIMARY KEY (id);

ALTER TABLE "provider_webhook_inbox" ADD CONSTRAINT "provider_webhook_inbox_pkey" PRIMARY KEY (id);

ALTER TABLE "runtime_config_entries" ADD CONSTRAINT "runtime_config_entries_pkey" PRIMARY KEY (key);

ALTER TABLE "runtime_config_revisions" ADD CONSTRAINT "runtime_config_revisions_pkey" PRIMARY KEY (id);

ALTER TABLE "scene_prompt_templates" ADD CONSTRAINT "scene_prompt_templates_pkey" PRIMARY KEY (id);

ALTER TABLE "script_reader_sections" ADD CONSTRAINT "script_reader_sections_pkey" PRIMARY KEY (id);

ALTER TABLE "scripts" ADD CONSTRAINT "scripts_pkey" PRIMARY KEY (id);

ALTER TABLE "shot_prompt_templates" ADD CONSTRAINT "shot_prompt_templates_pkey" PRIMARY KEY (id);

ALTER TABLE "shot_reference_assets" ADD CONSTRAINT "shot_reference_assets_pkey" PRIMARY KEY (id);

ALTER TABLE "shots" ADD CONSTRAINT "shots_pkey" PRIMARY KEY (id);

ALTER TABLE "sms_send_records" ADD CONSTRAINT "sms_send_records_pkey" PRIMARY KEY (id);

ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_pkey" PRIMARY KEY (id);

ALTER TABLE "storage_upload_sessions" ADD CONSTRAINT "storage_upload_sessions_pkey" PRIMARY KEY (id);

ALTER TABLE "storyboard_prompt_package_versions" ADD CONSTRAINT "storyboard_prompt_package_versions_pkey" PRIMARY KEY (id);

ALTER TABLE "storyboard_prompt_packages" ADD CONSTRAINT "storyboard_prompt_packages_pkey" PRIMARY KEY (id);

ALTER TABLE "storyboard_prompt_templates" ADD CONSTRAINT "storyboard_prompt_templates_pkey" PRIMARY KEY (id);

ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_pkey" PRIMARY KEY (id);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pkey" PRIMARY KEY (id);

ALTER TABLE "team_assets" ADD CONSTRAINT "team_assets_pkey" PRIMARY KEY (id);

ALTER TABLE "team_member_auth_sessions" ADD CONSTRAINT "team_member_auth_sessions_pkey" PRIMARY KEY (id);

ALTER TABLE "team_member_canvases" ADD CONSTRAINT "team_member_canvases_pkey" PRIMARY KEY (id);

ALTER TABLE "team_member_project_records" ADD CONSTRAINT "team_member_project_records_pkey" PRIMARY KEY (id);

ALTER TABLE "team_member_projects" ADD CONSTRAINT "team_member_projects_pkey" PRIMARY KEY (id);

ALTER TABLE "team_member_scripts" ADD CONSTRAINT "team_member_scripts_pkey" PRIMARY KEY (id);

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_pkey" PRIMARY KEY (id);

ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_pkey" PRIMARY KEY (id);

ALTER TABLE "user_invite_bindings" ADD CONSTRAINT "user_invite_bindings_pkey" PRIMARY KEY (id);

ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_pkey" PRIMARY KEY (id);

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_pkey" PRIMARY KEY (id);

ALTER TABLE "users" ADD CONSTRAINT "users_pkey" PRIMARY KEY (id);

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_pkey" PRIMARY KEY (id);

ALTER TABLE "admin_account_roles" ADD CONSTRAINT "admin_account_roles_admin_account_id_role_code_key" UNIQUE (admin_account_id, role_code);

ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_login_name_key" UNIQUE (login_name);

ALTER TABLE "admin_auth_sessions" ADD CONSTRAINT "admin_auth_sessions_session_token_hash_key" UNIQUE (session_token_hash);

ALTER TABLE "admin_secret_references" ADD CONSTRAINT "admin_secret_references_env_name_key" UNIQUE (env_name);

ALTER TABLE "admin_secret_references" ADD CONSTRAINT "admin_secret_references_secret_ref_key" UNIQUE (secret_ref);

ALTER TABLE "admin_secret_values" ADD CONSTRAINT "admin_secret_values_secret_key_key" UNIQUE (secret_key);

ALTER TABLE "admin_secret_values" ADD CONSTRAINT "admin_secret_values_secret_ref_key" UNIQUE (secret_ref);

ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_model_code_key" UNIQUE (model_code);

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_model_config_id_key" UNIQUE (model_config_id);

ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_version_number_key" UNIQUE (asset_id, version_number);

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_session_token_hash_key" UNIQUE (session_token_hash);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_order_no_key" UNIQUE (order_no);

ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_calibration_session_id_shot_id_key" UNIQUE (calibration_session_id, shot_id);

ALTER TABLE "character_prompt_templates" ADD CONSTRAINT "character_prompt_templates_code_key" UNIQUE (code);

ALTER TABLE "creator_canvas_edges" ADD CONSTRAINT "creator_canvas_edges_canvas_project_id_edge_key_key" UNIQUE (canvas_project_id, edge_key);

ALTER TABLE "creator_canvas_edges" ADD CONSTRAINT "creator_canvas_edges_canvas_project_id_source_node_key_sour_key" UNIQUE (canvas_project_id, source_node_key, source_port_id, target_node_key, target_port_id);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_canvas_project_id_node_key_run_no_key" UNIQUE (canvas_project_id, node_key, run_no);

ALTER TABLE "creator_canvas_nodes" ADD CONSTRAINT "creator_canvas_nodes_canvas_project_id_node_key_key" UNIQUE (canvas_project_id, node_key);

ALTER TABLE "credit_packages" ADD CONSTRAINT "credit_packages_code_key" UNIQUE (code);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_key_unique" UNIQUE (reservation_id, allocation_key);

ALTER TABLE "credit_reservation_lot_allocations" ADD CONSTRAINT "credit_reservation_lot_allocat_reservation_id_credit_lot_id_key" UNIQUE (reservation_id, credit_lot_id);

ALTER TABLE "episode_asset_conversation_messages" ADD CONSTRAINT "episode_asset_conversation_messages_thread_id_message_key_key" UNIQUE (thread_id, message_key);

ALTER TABLE "image_prompt_styles" ADD CONSTRAINT "image_prompt_styles_code_key" UNIQUE (code);

ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_consumer_name_outbox_event_id_key" UNIQUE (consumer_name, outbox_event_id);

ALTER TABLE "invite_reward_grants" ADD CONSTRAINT "invite_reward_grants_binding_id_reward_type_source_type_sou_key" UNIQUE (binding_id, reward_type, source_type, source_id, recipient_user_id);

ALTER TABLE "library_asset_versions" ADD CONSTRAINT "library_asset_versions_library_asset_id_version_number_key" UNIQUE (library_asset_id, version_number);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_code_key" UNIQUE (code);

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_provider_order_unique" UNIQUE (provider, merchant_order_no);

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_provider_merchant_order_no_key" UNIQUE (provider, merchant_order_no);

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_provider_provider_event_dedup_key_key" UNIQUE (provider, provider_event_dedup_key);

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_provider_provider_event_dedup_key_key" UNIQUE (provider, provider_event_dedup_key);

ALTER TABLE "prop_prompt_templates" ADD CONSTRAINT "prop_prompt_templates_code_key" UNIQUE (code);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_key_unique" UNIQUE (provider_name, provider_operation, request_key);

ALTER TABLE "scene_prompt_templates" ADD CONSTRAINT "scene_prompt_templates_code_key" UNIQUE (code);

ALTER TABLE "shot_prompt_templates" ADD CONSTRAINT "shot_prompt_templates_code_key" UNIQUE (code);

ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_bucket_object_key_key" UNIQUE (bucket, object_key);

ALTER TABLE "storyboard_prompt_package_versions" ADD CONSTRAINT "storyboard_prompt_package_versions_package_id_version_no_key" UNIQUE (package_id, version_no);

ALTER TABLE "storyboard_prompt_packages" ADD CONSTRAINT "storyboard_prompt_packages_code_key" UNIQUE (code);

ALTER TABLE "storyboard_prompt_templates" ADD CONSTRAINT "storyboard_prompt_templates_code_key" UNIQUE (code);

ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_task_id_attempt_number_key" UNIQUE (task_id, attempt_number);

ALTER TABLE "team_member_auth_sessions" ADD CONSTRAINT "team_member_auth_sessions_auth_session_id_key" UNIQUE (auth_session_id);

ALTER TABLE "team_member_canvases" ADD CONSTRAINT "team_member_canvases_member_id_canvas_id_key" UNIQUE (member_id, canvas_id);

ALTER TABLE "team_member_projects" ADD CONSTRAINT "team_member_projects_member_id_project_id_key" UNIQUE (member_id, project_id);

ALTER TABLE "team_member_scripts" ADD CONSTRAINT "team_member_scripts_member_id_script_id_key" UNIQUE (member_id, script_id);

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_id_user_id_key" UNIQUE (id, user_id);

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_login_account_key" UNIQUE (member_login_account);

ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_entitlement_key_key" UNIQUE (user_id, entitlement_key);

ALTER TABLE "user_invite_bindings" ADD CONSTRAINT "user_invite_bindings_invited_user_id_key" UNIQUE (invited_user_id);

ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_user_id_key" UNIQUE (user_id);

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_provider_request_id_key" UNIQUE (provider_request_id);

ALTER TABLE "users" ADD CONSTRAINT "users_email_key" UNIQUE (email);

ALTER TABLE "users" ADD CONSTRAINT "users_phone_e164_key" UNIQUE (phone_e164);

ALTER TABLE "admin_account_roles" ADD CONSTRAINT "admin_account_roles_role_code_check" CHECK (role_code = ANY (ARRAY['super_admin'::text, 'ops_admin'::text, 'model_admin'::text, 'finance_admin'::text, 'support_admin'::text, 'audit_viewer'::text]));

ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_status_check" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'archived'::text]));

ALTER TABLE "admin_accounts" ADD CONSTRAINT "admin_accounts_super_admin_slot_check" CHECK (super_admin_slot IS NULL OR super_admin_slot > 0);

ALTER TABLE "admin_secret_references" ADD CONSTRAINT "admin_secret_references_status_check" CHECK (status = ANY (ARRAY['configured'::text, 'missing'::text, 'unknown'::text]));

ALTER TABLE "admin_secret_values" ADD CONSTRAINT "admin_secret_values_secret_value_check" CHECK (btrim(secret_value) <> ''::text);

ALTER TABLE "admin_secret_values" ADD CONSTRAINT "admin_secret_values_status_check" CHECK (status = ANY (ARRAY['configured'::text, 'missing'::text, 'unknown'::text]));

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "ai_generation_task_snapshots_credit_status_check" CHECK (credit_status = ANY (ARRAY['not_required'::text, 'reserved'::text, 'consumed'::text, 'released'::text, 'manual_review_required'::text]));

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "ai_generation_task_snapshots_estimated_credits_check" CHECK (estimated_credits >= 0);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "ai_generation_task_snapshots_media_type_check" CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'text'::text, 'multimodal'::text]));

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "ai_generation_task_snapshots_progress_percent_check" CHECK (progress_percent IS NULL OR progress_percent >= 0 AND progress_percent <= 100);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "ai_generation_task_snapshots_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text, 'result_unknown'::text, 'manual_review_required'::text]));

ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_invocation_mode_check" CHECK (invocation_mode = ANY (ARRAY['sync'::text, 'async_polling'::text, 'stream'::text, 'webhook'::text]));

ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_media_type_check" CHECK (media_type = ANY (ARRAY['text'::text, 'image'::text, 'video'::text, 'audio'::text, 'multimodal'::text]));

ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_provider_protocol_check" CHECK (provider_protocol = ANY (ARRAY['creator_dev'::text, 'openai_images'::text, 'openai_compatible_chat'::text, 'cumob_chat'::text, 'volcengine_ark_image'::text, 'volcengine_ark_video'::text, 'aliyun_bailian_video'::text, 'aliyun_bailian_audio'::text, 'apimart_audio'::text, 'globalaiopc_video'::text, 'lingdong_api'::text, 'cumob_image'::text, 'global_ai_opc_image'::text, 'extra_token_video'::text, 'saier_video'::text, 'banana_router'::text, 'custom_http'::text]));

ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_status_check" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'archived'::text]));

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_polling_concurrency_limit_check" CHECK (polling_concurrency_limit > 0);

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_polling_interval_ms_check" CHECK (polling_interval_ms >= 1000);

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_provider_concurrent_limit_check" CHECK (provider_concurrent_limit > 0);

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_provider_rpm_limit_check" CHECK (provider_rpm_limit > 0);

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_queue_backend_check" CHECK (queue_backend = 'bullmq'::text);

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_status_check" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'archived'::text]));

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_submit_concurrency_limit_check" CHECK (submit_concurrency_limit > 0);

ALTER TABLE "generation_queue_routes" ADD CONSTRAINT "generation_queue_routes_code_check" CHECK (route_code ~ '^[a-z0-9]+$'::text);

ALTER TABLE "generation_queue_routes" ADD CONSTRAINT "generation_queue_routes_key_check" CHECK (length(btrim(route_key)) > 0);

ALTER TABLE "generation_queue_routes" ADD CONSTRAINT "generation_queue_routes_route_code_key" UNIQUE (route_code);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_admitted_count_check" CHECK (admitted_count >= 0 AND admitted_count <= capacity);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_capacity_check" CHECK (capacity = 600);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_media_type_check" CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text]));

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_queue_name_check" CHECK (queue_name ~ '^[a-z0-9-]+$'::text);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_queue_name_key" UNIQUE (queue_name);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_rate_limit_check" CHECK (rate_limit_max = 5 AND rate_limit_duration_ms = 1000);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_route_code_check" CHECK (route_code ~ '^[a-z0-9]+$'::text);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_scope_key" UNIQUE (media_type, stage, route_key, shard_no);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_shard_no_check" CHECK (shard_no >= 0);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_stage_check" CHECK (stage = ANY (ARRAY['submit'::text, 'poll'::text, 'fetch'::text, 'persist'::text]));

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_state_check" CHECK (state = ANY (ARRAY['accepting'::text, 'full'::text, 'draining'::text, 'retired'::text]));

ALTER TABLE "generation_queue_stage_assignments" ADD CONSTRAINT "generation_queue_stage_assignments_key_check" CHECK (length(btrim(assignment_key)) > 0);

ALTER TABLE "generation_queue_stage_assignments" ADD CONSTRAINT "generation_queue_stage_assignments_media_type_check" CHECK (media_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text]));

ALTER TABLE "generation_queue_stage_assignments" ADD CONSTRAINT "generation_queue_stage_assignments_release_check" CHECK ((status = 'admitted'::text AND released_at IS NULL AND release_reason IS NULL) OR (status = 'released'::text AND released_at IS NOT NULL AND length(btrim(release_reason)) > 0));

ALTER TABLE "generation_queue_stage_assignments" ADD CONSTRAINT "generation_queue_stage_assignments_stage_check" CHECK (stage = ANY (ARRAY['submit'::text, 'poll'::text, 'fetch'::text, 'persist'::text]));

ALTER TABLE "generation_queue_stage_assignments" ADD CONSTRAINT "generation_queue_stage_assignments_status_check" CHECK (status = ANY (ARRAY['admitted'::text, 'released'::text]));

ALTER TABLE "generation_stage_successors" ADD CONSTRAINT "generation_stage_successors_stage_check" CHECK (stage = ANY (ARRAY['submit'::text, 'poll'::text, 'fetch'::text, 'persist'::text]));

ALTER TABLE "generation_stage_successors" ADD CONSTRAINT "generation_stage_successors_poll_attempt_check" CHECK (poll_attempt >= 0);

ALTER TABLE "generation_stage_successors" ADD CONSTRAINT "generation_stage_successors_next_action_check" CHECK (next_action = ANY (ARRAY['submit'::text, 'poll'::text, 'finalize'::text, 'stop'::text]));

ALTER TABLE "generation_stage_successors" ADD CONSTRAINT "generation_stage_successors_status_check" CHECK (status = ANY (ARRAY['scheduled'::text, 'confirmed'::text, 'terminal'::text, 'failed'::text]));

ALTER TABLE "generation_stage_successors" ADD CONSTRAINT "generation_stage_successors_unique_stage" UNIQUE (task_id, stage, poll_attempt);

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE "asset_review_candidates" ADD CONSTRAINT "asset_review_candidates_candidate_group_check" CHECK (candidate_group = ANY (ARRAY['character'::text, 'scene'::text, 'prop'::text]));

ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_version_number_check" CHECK (version_number >= 1);

ALTER TABLE "assets" ADD CONSTRAINT "assets_asset_type_check" CHECK (asset_type = ANY (ARRAY['character_sheet'::text, 'scene_reference'::text, 'prop_reference'::text, 'shot_image'::text, 'shot_video'::text]));

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_exclusive_check" CHECK (NOT (actor_user_id IS NOT NULL AND actor_admin_account_id IS NOT NULL));

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_status_check" CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_amount_minor_check" CHECK (amount_minor > 0);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_credits_product_shape_check" CHECK (product_type = 'credit_package'::text AND credits > 0 OR product_type = 'membership_plan'::text AND credits >= 0);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_currency_check" CHECK (currency = 'CNY'::text);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_paid_requires_intent" CHECK (status <> 'paid'::text OR paid_at IS NOT NULL AND successful_payment_intent_id IS NOT NULL);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_product_shape_check" CHECK (product_type = 'credit_package'::text AND credit_package_id IS NOT NULL AND membership_plan_id IS NULL OR product_type = 'membership_plan'::text AND membership_plan_id IS NOT NULL AND credit_package_id IS NULL);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_product_type_check" CHECK (product_type = ANY (ARRAY['credit_package'::text, 'membership_plan'::text]));

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_status_check" CHECK (status = ANY (ARRAY['pending_payment'::text, 'paid'::text, 'closed'::text, 'expired'::text, 'refund_pending'::text, 'partially_refunded'::text, 'refunded'::text]));

ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_quality_review_result_check" CHECK (quality_review_result = ANY (ARRAY['not_checked'::text, 'passed'::text, 'failed'::text, 'review_required'::text]));

ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'generating'::text, 'succeeded'::text, 'failed'::text, 'review_required'::text]));

ALTER TABLE "calibration_sessions" ADD CONSTRAINT "calibration_sessions_decision_type_check" CHECK (decision_type = ANY (ARRAY['passed'::text, 'skipped'::text, 'override'::text]));

ALTER TABLE "calibration_sessions" ADD CONSTRAINT "calibration_sessions_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'generating'::text, 'ready_for_review'::text, 'passed'::text, 'failed'::text, 'skipped'::text, 'archived'::text]));

ALTER TABLE "character_prompt_templates" ADD CONSTRAINT "character_prompt_templates_code_check" CHECK (code ~ '^[a-z0-9_]+$'::text);

ALTER TABLE "character_prompt_templates" ADD CONSTRAINT "character_prompt_templates_model_family_check" CHECK (model_family = ANY (ARRAY['general'::text, 'doubao'::text, 'seedream'::text]));

ALTER TABLE "character_prompt_templates" ADD CONSTRAINT "character_prompt_templates_stage_check" CHECK (stage = 'extract'::text);

ALTER TABLE "character_prompt_templates" ADD CONSTRAINT "character_prompt_templates_status_check" CHECK (status = ANY (ARRAY['enabled'::text, 'disabled'::text]));

ALTER TABLE "creator_canvas_documents" ADD CONSTRAINT "creator_canvas_documents_edge_count_check" CHECK (edge_count >= 0);

ALTER TABLE "creator_canvas_documents" ADD CONSTRAINT "creator_canvas_documents_node_count_check" CHECK (node_count >= 0);

ALTER TABLE "creator_canvas_documents" ADD CONSTRAINT "creator_canvas_documents_schema_version_check" CHECK (schema_version >= 1);

ALTER TABLE "creator_canvas_documents" ADD CONSTRAINT "creator_canvas_documents_server_revision_check" CHECK (server_revision >= 1);

ALTER TABLE "creator_canvas_node_artifacts" ADD CONSTRAINT "creator_canvas_node_artifacts_artifact_kind_check" CHECK (artifact_kind = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'text'::text, 'asset'::text, 'unknown'::text]));

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_media_kind_check" CHECK (media_kind = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'text'::text, 'multimodal'::text]));

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_run_no_check" CHECK (run_no >= 1);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_status_check" CHECK (status = ANY (ARRAY['created'::text, 'queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text, 'result_unknown'::text, 'manual_review_required'::text]));

ALTER TABLE "creator_canvas_projects" ADD CONSTRAINT "creator_canvas_projects_server_revision_check" CHECK (server_revision >= 1);

ALTER TABLE "creator_canvas_projects" ADD CONSTRAINT "creator_canvas_projects_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text]));

ALTER TABLE "creator_canvas_revisions" ADD CONSTRAINT "creator_canvas_revisions_server_revision_check" CHECK (server_revision >= 1);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_amount_check" CHECK (amount > 0);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_balance_after_check" CHECK (balance_after >= 0);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_delta_shape" CHECK (entry_type = 'grant'::text AND available_delta = amount AND reserved_delta = 0 AND consumed_delta = 0 OR entry_type = 'reservation'::text AND available_delta = (- amount) AND reserved_delta = amount AND consumed_delta = 0 OR entry_type = 'consume'::text AND available_delta = 0 AND reserved_delta = (- amount) AND consumed_delta = amount OR entry_type = 'release'::text AND available_delta = amount AND reserved_delta = (- amount) AND consumed_delta = 0 OR entry_type = 'expire'::text AND (available_delta = (- amount) OR available_delta = 0) AND reserved_delta = 0 AND consumed_delta = 0 OR entry_type = 'transfer_out'::text AND available_delta = (- amount) AND reserved_delta = 0 AND consumed_delta = 0 OR entry_type = 'transfer_in'::text AND available_delta = amount AND reserved_delta = 0 AND consumed_delta = 0 OR entry_type = 'freeze'::text AND available_delta = (- amount) AND reserved_delta = 0 AND consumed_delta = 0 OR entry_type = 'restore'::text AND available_delta = amount AND reserved_delta = 0 AND consumed_delta = 0);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_entry_type_check" CHECK (entry_type = ANY (ARRAY['grant'::text, 'reservation'::text, 'consume'::text, 'release'::text, 'expire'::text, 'transfer_out'::text, 'transfer_in'::text, 'freeze'::text, 'restore'::text]));

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_amounts_match" CHECK (total_amount = (available_amount + reserved_amount + consumed_amount + expired_amount));

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_available_amount_check" CHECK (available_amount >= 0);

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_consumed_amount_check" CHECK (consumed_amount >= 0);

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_expired_amount_check" CHECK (expired_amount >= 0);

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_frozen_window_check" CHECK (status <> 'frozen'::text AND frozen_at IS NULL AND frozen_until IS NULL OR status = 'frozen'::text AND frozen_at IS NOT NULL AND frozen_until IS NOT NULL AND frozen_until > frozen_at);

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_reserved_amount_check" CHECK (reserved_amount >= 0);

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_status_check" CHECK (status = ANY (ARRAY['active'::text, 'frozen'::text, 'expired'::text]));

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_total_amount_check" CHECK (total_amount > 0);

ALTER TABLE "credit_packages" ADD CONSTRAINT "credit_packages_amount_minor_check" CHECK (amount_minor > 0);

ALTER TABLE "credit_packages" ADD CONSTRAINT "credit_packages_credits_check" CHECK (credits > 0);

ALTER TABLE "credit_packages" ADD CONSTRAINT "credit_packages_currency_check" CHECK (currency = 'CNY'::text);

ALTER TABLE "credit_packages" ADD CONSTRAINT "credit_packages_gift_credits_check" CHECK (gift_credits >= 0);

ALTER TABLE "credit_packages" ADD CONSTRAINT "credit_packages_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE "credit_packages" ADD CONSTRAINT "credit_packages_validity_window_check" CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_amount_check" CHECK (amount > 0);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_status_check" CHECK (status = ANY (ARRAY['reserved'::text, 'consumed'::text, 'released'::text, 'manual_review_required'::text]));

ALTER TABLE "credit_reservation_lot_allocations" ADD CONSTRAINT "credit_reservation_lot_allocations_amount_check" CHECK (amount > 0);

ALTER TABLE "credit_reservation_lot_allocations" ADD CONSTRAINT "credit_reservation_lot_allocations_status_check" CHECK (status = ANY (ARRAY['reserved'::text, 'consumed'::text, 'released'::text, 'manual_review_required'::text]));

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_amount_consumed_check" CHECK (amount_consumed >= 0);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_amount_released_check" CHECK (amount_released >= 0);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_amount_reserved_check" CHECK (amount_reserved >= 0);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_amount_total_check" CHECK (amount_total > 0);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_amounts_match" CHECK (amount_total = (amount_reserved + amount_consumed + amount_released));

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_status_check" CHECK (status = ANY (ARRAY['active'::text, 'partially_settled'::text, 'settled'::text, 'released'::text, 'manual_review_required'::text]));

ALTER TABLE "credit_wallet_transfers" ADD CONSTRAINT "credit_wallet_transfers_amount_check" CHECK (amount > 0);

ALTER TABLE "credit_wallet_transfers" ADD CONSTRAINT "credit_wallet_transfers_status_check" CHECK (status = ANY (ARRAY['succeeded'::text, 'failed'::text]));

ALTER TABLE "episode_asset_conversation_messages" ADD CONSTRAINT "episode_asset_conversation_messages_message_type_check" CHECK (message_type = ANY (ARRAY['user_request'::text, 'task_status'::text, 'result'::text]));

ALTER TABLE "episode_asset_conversation_threads" ADD CONSTRAINT "episode_asset_conversation_threads_media_mode_check" CHECK (media_mode = ANY (ARRAY['image'::text, 'video'::text]));

ALTER TABLE "episode_generation_drafts" ADD CONSTRAINT "episode_generation_drafts_mode_check" CHECK (mode = ANY (ARRAY['image'::text, 'video'::text, 'lip_sync'::text]));

ALTER TABLE "episode_generation_drafts" ADD CONSTRAINT "episode_generation_drafts_target_type_check" CHECK (target_type = ANY (ARRAY['asset'::text, 'storyboard'::text]));

ALTER TABLE "episodes" ADD CONSTRAINT "episodes_sequence_check" CHECK (sequence >= 1);

ALTER TABLE "episodes" ADD CONSTRAINT "episodes_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'ready'::text, 'archived'::text]));

ALTER TABLE "export_records" ADD CONSTRAINT "export_records_item_count_check" CHECK (item_count >= 0);

ALTER TABLE "export_records" ADD CONSTRAINT "export_records_manifest_status_check" CHECK (manifest_status = ANY (ARRAY['ready'::text, 'partial'::text]));

ALTER TABLE "export_records" ADD CONSTRAINT "export_records_missing_asset_count_check" CHECK (missing_asset_count >= 0);

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_actor_scope_check" CHECK (user_id IS NOT NULL AND admin_account_id IS NULL AND scope_key = ('user:'::text || user_id::text) OR user_id IS NULL AND admin_account_id IS NOT NULL AND scope_key = ('admin:'::text || admin_account_id::text));

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_response_pair" CHECK (response_resource_type IS NULL AND response_resource_id IS NULL OR response_resource_type IS NOT NULL AND response_resource_id IS NOT NULL);

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_status_check" CHECK (status = ANY (ARRAY['processing'::text, 'succeeded'::text, 'failed_retryable'::text, 'failed_terminal'::text, 'expired'::text]));

ALTER TABLE "image_prompt_styles" ADD CONSTRAINT "image_prompt_styles_batch_preset_target_check" CHECK (batch_preset_target IS NULL OR (batch_preset_target = ANY (ARRAY['scene'::text, 'character'::text, 'prop'::text])));

ALTER TABLE "image_prompt_styles" ADD CONSTRAINT "image_prompt_styles_category_check" CHECK (category = ANY (ARRAY['official'::text, 'batch'::text, 'custom'::text]));

ALTER TABLE "image_prompt_styles" ADD CONSTRAINT "image_prompt_styles_code_check" CHECK (code ~ '^[a-z0-9_-]+$'::text);

ALTER TABLE "image_prompt_styles" ADD CONSTRAINT "image_prompt_styles_model_family_check" CHECK (model_family = ANY (ARRAY['doubao'::text, 'seedream'::text, 'general'::text]));

ALTER TABLE "image_prompt_styles" ADD CONSTRAINT "image_prompt_styles_status_check" CHECK (status = ANY (ARRAY['enabled'::text, 'disabled'::text]));

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_inviter_gift_credits_check" CHECK (inviter_gift_credits >= 0);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_new_user_gift_credits_check" CHECK (new_user_gift_credits >= 0);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_per_invited_user_rebate_cap_minor_check" CHECK (per_invited_user_rebate_cap_minor IS NULL OR per_invited_user_rebate_cap_minor >= 0);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_per_inviter_period_rebate_cap_minor_check" CHECK (per_inviter_period_rebate_cap_minor IS NULL OR per_inviter_period_rebate_cap_minor >= 0);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_rebate_credit_rate_check" CHECK (rebate_credit_rate >= 0);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_rebate_percent_check" CHECK (rebate_percent >= 0::numeric);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_rebate_window_days_check" CHECK (rebate_window_days >= 0);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE "invite_reward_grants" ADD CONSTRAINT "invite_reward_grants_amount_minor_check" CHECK (amount_minor IS NULL OR amount_minor >= 0);

ALTER TABLE "invite_reward_grants" ADD CONSTRAINT "invite_reward_grants_credits_check" CHECK (credits >= 0);

ALTER TABLE "invite_reward_grants" ADD CONSTRAINT "invite_reward_grants_reward_type_check" CHECK (reward_type = ANY (ARRAY['new_user_trial'::text, 'inviter_trial'::text, 'inviter_rebate'::text]));

ALTER TABLE "invite_reward_grants" ADD CONSTRAINT "invite_reward_grants_source_type_check" CHECK (source_type = ANY (ARRAY['invite_binding'::text, 'billing_order'::text]));

ALTER TABLE "invite_reward_grants" ADD CONSTRAINT "invite_reward_grants_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'granted'::text, 'skipped'::text, 'failed'::text, 'revoked'::text]));

ALTER TABLE "library_asset_versions" ADD CONSTRAINT "library_asset_versions_height_check" CHECK (height >= 1);

ALTER TABLE "library_asset_versions" ADD CONSTRAINT "library_asset_versions_version_number_check" CHECK (version_number >= 1);

ALTER TABLE "library_asset_versions" ADD CONSTRAINT "library_asset_versions_width_check" CHECK (width >= 1);

ALTER TABLE "library_assets" ADD CONSTRAINT "library_assets_asset_type_check" CHECK (asset_type = ANY (ARRAY['character'::text, 'scene'::text, 'prop'::text, 'image'::text, 'video'::text]));

ALTER TABLE "library_assets" ADD CONSTRAINT "library_assets_category_check" CHECK (category = ANY (ARRAY['character'::text, 'scene'::text, 'prop'::text, 'image'::text, 'video'::text]));

ALTER TABLE "library_assets" ADD CONSTRAINT "library_assets_scope_check" CHECK (scope = ANY (ARRAY['official'::text, 'team'::text, 'personal'::text]));

ALTER TABLE "library_assets" ADD CONSTRAINT "library_assets_status_check" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]));

ALTER TABLE "library_assets" ADD CONSTRAINT "library_assets_user_owner_shape_check" CHECK (scope = 'official'::text OR owner_user_id IS NOT NULL AND (scope <> 'personal'::text OR created_by_user_id IS NOT NULL));

ALTER TABLE "login_challenges" ADD CONSTRAINT "login_challenges_status_check" CHECK (status = ANY (ARRAY['issued'::text, 'consumed'::text, 'expired'::text, 'revoked'::text, 'locked'::text]));

ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_check" CHECK (period_end_at > period_start_at);

ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_gift_credits_check" CHECK (gift_credits >= 0);

ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_status_check" CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'manually_revoked'::text]));

ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_tier_check" CHECK (tier = ANY (ARRAY['experience'::text, 'professional'::text]));

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_amount_minor_check" CHECK (amount_minor > 0);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_check" CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_currency_check" CHECK (currency = 'CNY'::text);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_gift_credits_check" CHECK (gift_credits >= 0);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_period_count_check" CHECK (period_count > 0);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_period_unit_check" CHECK (period_unit = ANY (ARRAY['day'::text, 'month'::text, 'quarter'::text, 'year'::text]));

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_seat_limit_check" CHECK (seat_limit >= 0);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text, 'archived'::text]));

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_tier_check" CHECK (tier = ANY (ARRAY['experience'::text, 'professional'::text]));

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_usage_scene_check" CHECK (usage_scene = ANY (ARRAY['purchase'::text, 'invite_new_user'::text, 'invite_inviter'::text, 'manual_gift'::text, 'test'::text]));

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_visibility_check" CHECK (visibility = ANY (ARRAY['public'::text, 'internal'::text]));

ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'processed'::text, 'failed'::text]));

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_amount_minor_check" CHECK (amount_minor > 0);

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_currency_check" CHECK (currency = 'CNY'::text);

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_provider_check" CHECK (provider = ANY (ARRAY['paylab'::text, 'wechat_pay'::text, 'alipay'::text, 'lakala'::text]));

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_status_check" CHECK (status = ANY (ARRAY['created'::text, 'submitted'::text, 'succeeded'::text, 'failed'::text, 'closed'::text, 'expired'::text, 'unknown'::text]));

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_amount_minor_check" CHECK (amount_minor >= 0);

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_currency_check" CHECK (currency = 'CNY'::text);

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_event_type_check" CHECK (event_type = ANY (ARRAY['payment_succeeded'::text, 'payment_failed'::text, 'payment_closed'::text, 'refund_succeeded'::text, 'unknown'::text]));

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_processing_status_check" CHECK (processing_status = ANY (ARRAY['received'::text, 'processed'::text, 'duplicate'::text, 'rejected'::text, 'unmatched'::text, 'manual_review_required'::text]));

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_provider_check" CHECK (provider = ANY (ARRAY['paylab'::text, 'wechat_pay'::text, 'alipay'::text]));

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_signature_status_check" CHECK (signature_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'invalid'::text]));

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_ack_status_check" CHECK (ack_status IS NULL OR (ack_status = ANY (ARRAY['not_sent'::text, 'sent_success'::text, 'sent_failure'::text])));

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_event_type_check" CHECK (event_type = ANY (ARRAY['payment_succeeded'::text, 'payment_failed'::text, 'payment_closed'::text, 'refund_succeeded'::text, 'unknown'::text]));

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_processing_status_check" CHECK (processing_status = ANY (ARRAY['received'::text, 'processed'::text, 'duplicate'::text, 'rejected'::text, 'unmatched'::text, 'manual_review_required'::text]));

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_provider_check" CHECK (provider = ANY (ARRAY['paylab'::text, 'wechat_pay'::text, 'alipay'::text, 'lakala'::text]));

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_signature_status_check" CHECK (signature_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'invalid'::text]));

ALTER TABLE "payment_reconciliation_items" ADD CONSTRAINT "payment_reconciliation_items_issue_type_check" CHECK (issue_type = ANY (ARRAY['missing_callback'::text, 'paid_without_credit'::text, 'amount_mismatch'::text, 'provider_paid_platform_unpaid'::text, 'platform_paid_provider_unpaid'::text, 'refund_mismatch'::text, 'invoice_refund_mismatch'::text]));

ALTER TABLE "payment_reconciliation_items" ADD CONSTRAINT "payment_reconciliation_items_status_check" CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text, 'manual_review_required'::text, 'ignored_with_reason'::text]));

ALTER TABLE "payment_reconciliation_runs" ADD CONSTRAINT "payment_reconciliation_runs_provider_check" CHECK (provider = ANY (ARRAY['paylab'::text, 'wechat_pay'::text, 'alipay'::text, 'lakala'::text, 'all'::text]));

ALTER TABLE "payment_reconciliation_runs" ADD CONSTRAINT "payment_reconciliation_runs_run_type_check" CHECK (run_type = ANY (ARRAY['recent'::text, 'expiry'::text, 'paid_without_credit'::text, 'daily_settlement'::text]));

ALTER TABLE "payment_reconciliation_runs" ADD CONSTRAINT "payment_reconciliation_runs_status_check" CHECK (status = ANY (ARRAY['running'::text, 'succeeded'::text, 'failed'::text, 'partial_failed'::text]));

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_decision_check" CHECK (decision = ANY (ARRAY['allow'::text, 'block'::text, 'manual_review'::text]));

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_risk_type_check" CHECK (risk_type = ANY (ARRAY['rate_limited'::text, 'signature_invalid'::text, 'amount_mismatch'::text, 'currency_mismatch'::text, 'merchant_mismatch'::text, 'duplicate_trade'::text, 'refund_requires_review'::text, 'callback_event_requires_review'::text, 'high_value_first_purchase'::text]));

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_severity_check" CHECK (severity = ANY (ARRAY['info'::text, 'warning'::text, 'critical'::text]));

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_status_check" CHECK (status = ANY (ARRAY['open'::text, 'reviewed'::text, 'ignored_with_reason'::text]));

ALTER TABLE "project_upload_records" ADD CONSTRAINT "project_upload_records_size_bytes_check" CHECK (size_bytes IS NULL OR size_bytes >= 0);

ALTER TABLE "project_source_documents" ADD CONSTRAINT "project_source_documents_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'ready'::text, 'parsed'::text, 'failed'::text]));

ALTER TABLE "projects" ADD CONSTRAINT "projects_aspect_ratio_check" CHECK (aspect_ratio = ANY (ARRAY['9:16'::text, '16:9'::text]));

ALTER TABLE "projects" ADD CONSTRAINT "projects_phase_check" CHECK (phase = ANY (ARRAY['script_input'::text, 'asset_review'::text, 'shot_generation'::text, 'export'::text]));

ALTER TABLE "projects" ADD CONSTRAINT "projects_resolution_check" CHECK (resolution = ANY (ARRAY['720p'::text, '1080p'::text]));

ALTER TABLE "prop_prompt_templates" ADD CONSTRAINT "prop_prompt_templates_code_check" CHECK (code ~ '^[a-z0-9_]+$'::text);

ALTER TABLE "prop_prompt_templates" ADD CONSTRAINT "prop_prompt_templates_model_family_check" CHECK (model_family = ANY (ARRAY['general'::text, 'doubao'::text, 'seedream'::text]));

ALTER TABLE "prop_prompt_templates" ADD CONSTRAINT "prop_prompt_templates_stage_check" CHECK (stage = 'extract'::text);

ALTER TABLE "prop_prompt_templates" ADD CONSTRAINT "prop_prompt_templates_status_check" CHECK (status = ANY (ARRAY['enabled'::text, 'disabled'::text]));

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_external_id_requires_start" CHECK (external_request_id IS NULL OR external_submission_started_at IS NOT NULL);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_status_check" CHECK (status = ANY (ARRAY['created'::text, 'submitted'::text, 'accepted'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text, 'result_unknown'::text, 'manual_review_required'::text]));

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_poll_sequence_check" CHECK (poll_sequence >= 0);

ALTER TABLE "provider_webhook_inbox" ADD CONSTRAINT "provider_webhook_inbox_status_check" CHECK (status = ANY (ARRAY['received'::text, 'dispatched'::text, 'unmatched'::text, 'failed'::text]));

ALTER TABLE "provider_webhook_inbox" ADD CONSTRAINT "provider_webhook_inbox_provider_event_key" UNIQUE (provider_name, event_key);

ALTER TABLE "runtime_config_entries" ADD CONSTRAINT "runtime_config_entries_scope_check" CHECK (scope = ANY (ARRAY['global'::text, 'admin'::text, 'creator'::text, 'model'::text, 'billing'::text, 'risk'::text]));

ALTER TABLE "runtime_config_entries" ADD CONSTRAINT "runtime_config_entries_value_type_check" CHECK (value_type = ANY (ARRAY['string'::text, 'number'::text, 'boolean'::text, 'json'::text, 'string_array'::text]));

ALTER TABLE "scene_prompt_templates" ADD CONSTRAINT "scene_prompt_templates_code_check" CHECK (code ~ '^[a-z0-9_]+$'::text);

ALTER TABLE "scene_prompt_templates" ADD CONSTRAINT "scene_prompt_templates_model_family_check" CHECK (model_family = ANY (ARRAY['general'::text, 'doubao'::text, 'seedream'::text]));

ALTER TABLE "scene_prompt_templates" ADD CONSTRAINT "scene_prompt_templates_stage_check" CHECK (stage = 'split'::text);

ALTER TABLE "scene_prompt_templates" ADD CONSTRAINT "scene_prompt_templates_status_check" CHECK (status = ANY (ARRAY['enabled'::text, 'disabled'::text]));

ALTER TABLE "script_reader_sections" ADD CONSTRAINT "script_reader_sections_sequence_check" CHECK (sequence >= 1);

ALTER TABLE "script_reader_sections" ADD CONSTRAINT "script_reader_sections_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'ready'::text, 'archived'::text]));

ALTER TABLE "scripts" ADD CONSTRAINT "scripts_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'ready'::text, 'parsed'::text, 'failed'::text]));

ALTER TABLE "shot_prompt_templates" ADD CONSTRAINT "shot_prompt_templates_code_check" CHECK (code ~ '^[a-z0-9_]+$'::text);

ALTER TABLE "shot_prompt_templates" ADD CONSTRAINT "shot_prompt_templates_model_family_check" CHECK (model_family = ANY (ARRAY['general'::text, 'doubao'::text, 'seedream'::text]));

ALTER TABLE "shot_prompt_templates" ADD CONSTRAINT "shot_prompt_templates_stage_check" CHECK (stage = 'outline'::text);

ALTER TABLE "shot_prompt_templates" ADD CONSTRAINT "shot_prompt_templates_status_check" CHECK (status = ANY (ARRAY['enabled'::text, 'disabled'::text]));

ALTER TABLE "shot_reference_assets" ADD CONSTRAINT "shot_reference_assets_reference_role_check" CHECK (reference_role = ANY (ARRAY['character'::text, 'scene'::text, 'prop'::text, 'reference_image'::text, 'reference_video'::text, 'reference_audio'::text, 'first_frame'::text, 'last_frame'::text, 'source_video'::text, 'locked_character'::text]));

ALTER TABLE "shots" ADD CONSTRAINT "shots_active_image_revision_check" CHECK (active_image_revision >= 1);

ALTER TABLE "shots" ADD CONSTRAINT "shots_content_revision_check" CHECK (content_revision >= 1);

ALTER TABLE "shots" ADD CONSTRAINT "shots_content_status_check" CHECK (content_status = ANY (ARRAY['draft'::text, 'ready'::text, 'stale'::text]));

ALTER TABLE "shots" ADD CONSTRAINT "shots_image_status_check" CHECK (image_status = ANY (ARRAY['draft'::text, 'ready'::text, 'generating'::text, 'completed'::text, 'failed'::text, 'stale'::text]));

ALTER TABLE "shots" ADD CONSTRAINT "shots_video_status_check" CHECK (video_status = ANY (ARRAY['not_ready'::text, 'ready'::text, 'generating'::text, 'completed'::text, 'failed'::text, 'stale'::text]));

ALTER TABLE "sms_send_records" ADD CONSTRAINT "sms_send_records_provider_check" CHECK (provider = ANY (ARRAY['tencent'::text, 'dev'::text]));

ALTER TABLE "sms_send_records" ADD CONSTRAINT "sms_send_records_status_check" CHECK (status = ANY (ARRAY['requested'::text, 'sent'::text, 'failed'::text, 'rate_limited'::text]));

ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_size_bytes_check" CHECK (size_bytes IS NULL OR size_bytes >= 0);

ALTER TABLE "storage_upload_sessions" ADD CONSTRAINT "storage_upload_sessions_expected_size_bytes_check" CHECK (expected_size_bytes IS NULL OR expected_size_bytes >= 0);

ALTER TABLE "storyboard_prompt_packages" ADD CONSTRAINT "storyboard_prompt_packages_code_check" CHECK (code ~ '^[a-z0-9_]+$'::text);

ALTER TABLE "storyboard_prompt_packages" ADD CONSTRAINT "storyboard_prompt_packages_package_type_check" CHECK (package_type = ANY (ARRAY['genre'::text, 'emotion'::text, 'taboo'::text]));

ALTER TABLE "storyboard_prompt_packages" ADD CONSTRAINT "storyboard_prompt_packages_status_check" CHECK (status = ANY (ARRAY['enabled'::text, 'disabled'::text]));

ALTER TABLE "storyboard_prompt_templates" ADD CONSTRAINT "storyboard_prompt_templates_code_check" CHECK (code ~ '^[a-z0-9_]+$'::text);

ALTER TABLE "storyboard_prompt_templates" ADD CONSTRAINT "storyboard_prompt_templates_status_check" CHECK (status = ANY (ARRAY['enabled'::text, 'disabled'::text]));

ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_attempt_number_check" CHECK (attempt_number >= 1);

ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_status_check" CHECK (status = ANY (ARRAY['created'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text, 'result_unknown'::text, 'manual_review_required'::text]));

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'succeeded'::text, 'failed'::text, 'cancel_requested'::text, 'canceled'::text, 'result_unknown'::text, 'manual_review_required'::text]));

ALTER TABLE "team_assets" ADD CONSTRAINT "team_assets_active_url_check" CHECK (asset_status <> 'active'::text OR asset_url ~ '^https://'::text);

ALTER TABLE "team_assets" ADD CONSTRAINT "team_assets_asset_category_check" CHECK (asset_category = ANY (ARRAY['character'::text, 'scene'::text, 'prop'::text, 'voice'::text]));

ALTER TABLE "team_assets" ADD CONSTRAINT "team_assets_asset_status_check" CHECK (asset_status = ANY (ARRAY['active'::text, 'generating'::text, 'archived'::text, 'failed'::text]));

ALTER TABLE "team_assets" ADD CONSTRAINT "team_assets_asset_url_check" CHECK (asset_url IS NULL OR asset_url ~ '^https://'::text);

ALTER TABLE "team_assets" ADD CONSTRAINT "team_assets_resource_size_check" CHECK (resource_size >= 0);

ALTER TABLE "team_member_auth_sessions" ADD CONSTRAINT "team_member_auth_sessions_status_check" CHECK (status = ANY (ARRAY['active'::text, 'revoked'::text, 'expired'::text]));

ALTER TABLE "team_member_project_records" ADD CONSTRAINT "team_member_project_records_record_status_check" CHECK (record_status = ANY (ARRAY['recorded'::text, 'running'::text, 'succeeded'::text, 'failed'::text]));

ALTER TABLE "team_member_projects" ADD CONSTRAINT "team_member_projects_role_check" CHECK (role = ANY (ARRAY['producer'::text, 'creator'::text, 'viewer'::text]));

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_check" CHECK (member_login_account = ((member_account || '@'::text) || member_account_suffix));

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_account_check" CHECK (member_account ~ '^[a-z0-9][a-z0-9_-]{2,31}$'::text);

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_account_suffix_check" CHECK (member_account_suffix ~ '^[a-z0-9][a-z0-9_-]{5,31}$'::text);

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_member_credits_check" CHECK (member_credits >= 0);

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_status_check" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'deleted'::text]));

ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_entitlement_key_check" CHECK (entitlement_key = ANY (ARRAY['canvas_access'::text, 'priority_generation'::text, 'team_asset_library'::text, 'team_member_management'::text, 'team_dashboard'::text, 'full_flow_agent'::text]));

ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_source_check" CHECK (source = ANY (ARRAY['manual'::text, 'payment'::text, 'trial'::text, 'dev_seed'::text]));

ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_status_check" CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text]));

ALTER TABLE "user_invite_bindings" ADD CONSTRAINT "user_invite_bindings_check" CHECK (invited_user_id <> inviter_user_id);

ALTER TABLE "user_invite_bindings" ADD CONSTRAINT "user_invite_bindings_status_check" CHECK (status = ANY (ARRAY['active'::text, 'invalid'::text, 'revoked'::text]));

ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_gift_credits_check" CHECK (gift_credits >= 0);

ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_membership_tier_check" CHECK (membership_tier = ANY (ARRAY['experience'::text, 'professional'::text]));

ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_status_check" CHECK (status = ANY (ARRAY['active'::text, 'expired'::text, 'revoked'::text]));

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_status_check" CHECK (status = ANY (ARRAY['created'::text, 'submitted'::text, 'succeeded'::text, 'failed'::text, 'canceled'::text]));

ALTER TABLE "users" ADD CONSTRAINT "users_credit_balance_cached_check" CHECK (credit_balance_cached >= 0);

ALTER TABLE "users" ADD CONSTRAINT "users_credit_frozen_cached_check" CHECK (credit_frozen_cached >= 0);

ALTER TABLE "users" ADD CONSTRAINT "users_credit_frozen_window_check" CHECK (credit_frozen_cached = 0 AND credit_frozen_at IS NULL AND credit_frozen_until IS NULL OR credit_frozen_cached > 0 AND credit_frozen_at IS NOT NULL AND credit_frozen_until IS NOT NULL AND credit_frozen_until > credit_frozen_at);

ALTER TABLE "users" ADD CONSTRAINT "users_credit_reserved_cached_check" CHECK (credit_reserved_cached >= 0);

ALTER TABLE "users" ADD CONSTRAINT "users_invite_code_format_check" CHECK (invite_code ~ '^[0-9A-Z]{10}$'::text);

ALTER TABLE "users" ADD CONSTRAINT "users_phone_e164_format_check" CHECK (phone_e164 IS NULL OR phone_e164 ~ '^1[0-9]{10}$'::text);

ALTER TABLE "users" ADD CONSTRAINT "users_status_check" CHECK (status = ANY (ARRAY['active'::text, 'disabled'::text, 'archived'::text]));

ALTER TABLE "users" ADD CONSTRAINT "users_team_account_suffix_format_check" CHECK (team_account_suffix IS NULL OR team_account_suffix ~ '^[a-z0-9]{6}$'::text);

ALTER TABLE "users" ADD CONSTRAINT "users_team_seat_limit_check" CHECK (team_seat_limit >= 0);

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_status_check" CHECK (status = ANY (ARRAY['queued'::text, 'running'::text, 'partial_succeeded'::text, 'succeeded'::text, 'failed'::text, 'cancel_requested'::text, 'canceled'::text, 'result_unknown'::text, 'manual_review_required'::text]));

ALTER TABLE "admin_account_roles" ADD CONSTRAINT "admin_account_roles_admin_account_id_fkey" FOREIGN KEY (admin_account_id) REFERENCES admin_accounts(id);

ALTER TABLE "admin_auth_sessions" ADD CONSTRAINT "admin_auth_sessions_admin_account_id_fkey" FOREIGN KEY (admin_account_id) REFERENCES admin_accounts(id);

ALTER TABLE "admin_secret_references" ADD CONSTRAINT "admin_secret_references_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "admin_secret_values" ADD CONSTRAINT "admin_secret_values_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "ai_generation_task_snapshots_model_config_id_fkey" FOREIGN KEY (model_config_id) REFERENCES ai_model_configs(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "ai_generation_task_snapshots_provider_request_id_fkey" FOREIGN KEY (provider_request_id) REFERENCES provider_requests(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "ai_generation_task_snapshots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "generation_snapshots_attempt_fkey" FOREIGN KEY (attempt_id) REFERENCES task_attempts(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "generation_snapshots_credit_reservation_fkey" FOREIGN KEY (credit_reservation_id) REFERENCES credit_reservations(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "generation_snapshots_episode_fkey" FOREIGN KEY (episode_id) REFERENCES episodes(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "generation_snapshots_project_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "generation_snapshots_canvas_project_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "generation_snapshots_single_owner_scope_check" CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "generation_snapshots_task_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE "ai_generation_task_snapshots" ADD CONSTRAINT "generation_snapshots_workflow_fkey" FOREIGN KEY (workflow_id) REFERENCES workflows(id);

ALTER TABLE "ai_model_config_revisions" ADD CONSTRAINT "ai_model_config_revisions_changed_by_admin_id_fkey" FOREIGN KEY (changed_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES users(id);

ALTER TABLE "ai_model_dispatch_policies" ADD CONSTRAINT "ai_model_dispatch_policies_model_config_id_fkey" FOREIGN KEY (model_config_id) REFERENCES ai_model_configs(id);

ALTER TABLE "generation_queue_shards" ADD CONSTRAINT "generation_queue_shards_route_key_fkey" FOREIGN KEY (route_key) REFERENCES generation_queue_routes(route_key);

ALTER TABLE "generation_queue_stage_assignments" ADD CONSTRAINT "generation_queue_stage_assignments_shard_id_fkey" FOREIGN KEY (shard_id) REFERENCES generation_queue_shards(id);

ALTER TABLE "generation_stage_successors" ADD CONSTRAINT "generation_stage_successors_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "asset_review_candidates" ADD CONSTRAINT "asset_review_candidates_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES assets(id);

ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "asset_versions" ADD CONSTRAINT "asset_versions_storage_object_id_fkey" FOREIGN KEY (storage_object_id) REFERENCES storage_objects(id);

ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "assets" ADD CONSTRAINT "assets_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "assets" ADD CONSTRAINT "assets_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "assets" ADD CONSTRAINT "assets_single_owner_scope_check" CHECK (((project_id IS NOT NULL) AND (canvas_project_id IS NULL)) OR ((project_id IS NULL) AND (canvas_project_id IS NOT NULL)));

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_admin_account_id_fkey" FOREIGN KEY (actor_admin_account_id) REFERENCES admin_accounts(id);

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id);

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_credit_grant_ledger_entry_id_fkey" FOREIGN KEY (credit_grant_ledger_entry_id) REFERENCES credit_ledger_entries(id);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_credit_package_id_fkey" FOREIGN KEY (credit_package_id) REFERENCES credit_packages(id);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_idempotency_record_id_fkey" FOREIGN KEY (idempotency_record_id) REFERENCES idempotency_records(id);

ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_membership_plan_id_fkey" FOREIGN KEY (membership_plan_id) REFERENCES membership_plans(id);

ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_calibration_session_id_fkey" FOREIGN KEY (calibration_session_id) REFERENCES calibration_sessions(id);

ALTER TABLE "calibration_items" ADD CONSTRAINT "calibration_items_shot_id_fkey" FOREIGN KEY (shot_id) REFERENCES shots(id);

ALTER TABLE "calibration_sessions" ADD CONSTRAINT "calibration_sessions_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "calibration_sessions" ADD CONSTRAINT "calibration_sessions_decided_by_user_id_fkey" FOREIGN KEY (decided_by_user_id) REFERENCES users(id);

ALTER TABLE "calibration_sessions" ADD CONSTRAINT "calibration_sessions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "character_prompt_templates" ADD CONSTRAINT "character_prompt_templates_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "character_prompt_templates" ADD CONSTRAINT "character_prompt_templates_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "creator_canvas_documents" ADD CONSTRAINT "creator_canvas_documents_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "creator_canvas_documents" ADD CONSTRAINT "creator_canvas_documents_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_documents" ADD CONSTRAINT "creator_canvas_documents_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_edges" ADD CONSTRAINT "creator_canvas_edges_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "creator_canvas_edges" ADD CONSTRAINT "creator_canvas_edges_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_edges" ADD CONSTRAINT "creator_canvas_edges_source_node_fkey" FOREIGN KEY (canvas_project_id, source_node_key) REFERENCES creator_canvas_nodes(canvas_project_id, node_key);

ALTER TABLE "creator_canvas_edges" ADD CONSTRAINT "creator_canvas_edges_target_node_fkey" FOREIGN KEY (canvas_project_id, target_node_key) REFERENCES creator_canvas_nodes(canvas_project_id, node_key);

ALTER TABLE "creator_canvas_edges" ADD CONSTRAINT "creator_canvas_edges_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_events" ADD CONSTRAINT "creator_canvas_events_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_events" ADD CONSTRAINT "creator_canvas_events_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "creator_canvas_node_artifacts" ADD CONSTRAINT "creator_canvas_node_artifacts_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES assets(id);

ALTER TABLE "creator_canvas_node_artifacts" ADD CONSTRAINT "creator_canvas_node_artifacts_asset_version_id_fkey" FOREIGN KEY (asset_version_id) REFERENCES asset_versions(id);

ALTER TABLE "creator_canvas_node_artifacts" ADD CONSTRAINT "creator_canvas_node_artifacts_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "creator_canvas_node_artifacts" ADD CONSTRAINT "creator_canvas_node_artifacts_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_node_artifacts" ADD CONSTRAINT "creator_canvas_node_artifacts_node_fkey" FOREIGN KEY (canvas_project_id, node_key) REFERENCES creator_canvas_nodes(canvas_project_id, node_key);

ALTER TABLE "creator_canvas_node_artifacts" ADD CONSTRAINT "creator_canvas_node_artifacts_run_id_fkey" FOREIGN KEY (run_id) REFERENCES creator_canvas_node_runs(id);

ALTER TABLE "creator_canvas_node_artifacts" ADD CONSTRAINT "creator_canvas_node_artifacts_storage_object_id_fkey" FOREIGN KEY (storage_object_id) REFERENCES storage_objects(id);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES task_attempts(id);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_generation_snapshot_id_fkey" FOREIGN KEY (generation_snapshot_id) REFERENCES ai_generation_task_snapshots(id);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_node_fkey" FOREIGN KEY (canvas_project_id, node_key) REFERENCES creator_canvas_nodes(canvas_project_id, node_key);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_provider_request_id_fkey" FOREIGN KEY (provider_request_id) REFERENCES provider_requests(id);

ALTER TABLE "creator_canvas_node_runs" ADD CONSTRAINT "creator_canvas_node_runs_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE "creator_canvas_nodes" ADD CONSTRAINT "creator_canvas_nodes_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "creator_canvas_nodes" ADD CONSTRAINT "creator_canvas_nodes_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_nodes" ADD CONSTRAINT "creator_canvas_nodes_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_projects" ADD CONSTRAINT "creator_canvas_projects_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_projects" ADD CONSTRAINT "creator_canvas_projects_latest_document_fkey" FOREIGN KEY (latest_document_id) REFERENCES creator_canvas_documents(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "creator_canvas_projects" ADD CONSTRAINT "creator_canvas_projects_updated_by_user_id_fkey" FOREIGN KEY (updated_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_revisions" ADD CONSTRAINT "creator_canvas_revisions_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "creator_canvas_revisions" ADD CONSTRAINT "creator_canvas_revisions_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "creator_canvas_sessions" ADD CONSTRAINT "creator_canvas_sessions_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "creator_canvas_sessions" ADD CONSTRAINT "creator_canvas_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_allocation_id_fkey" FOREIGN KEY (allocation_id) REFERENCES credit_reservation_allocations(id);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES credit_reservations(id);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_team_member_fkey" FOREIGN KEY (team_member_id, user_id) REFERENCES team_members(id, user_id);

ALTER TABLE "credit_ledger_entries" ADD CONSTRAINT "credit_ledger_entries_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_grant_ledger_entry_fkey" FOREIGN KEY (grant_ledger_entry_id) REFERENCES credit_ledger_entries(id);

ALTER TABLE "credit_lots" ADD CONSTRAINT "credit_lots_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES task_attempts(id);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_provider_request_id_fkey" FOREIGN KEY (provider_request_id) REFERENCES provider_requests(id);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES credit_reservations(id);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_settled_ledger_fkey" FOREIGN KEY (settled_ledger_entry_id) REFERENCES credit_ledger_entries(id);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE "credit_reservation_allocations" ADD CONSTRAINT "credit_reservation_allocations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "credit_reservation_lot_allocations" ADD CONSTRAINT "credit_reservation_lot_allocations_credit_lot_id_fkey" FOREIGN KEY (credit_lot_id) REFERENCES credit_lots(id);

ALTER TABLE "credit_reservation_lot_allocations" ADD CONSTRAINT "credit_reservation_lot_allocations_reservation_id_fkey" FOREIGN KEY (reservation_id) REFERENCES credit_reservations(id);

ALTER TABLE "credit_reservation_lot_allocations" ADD CONSTRAINT "credit_reservation_lot_allocations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_single_owner_scope_check" CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "credit_reservations" ADD CONSTRAINT "credit_reservations_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES workflows(id);

ALTER TABLE "credit_wallet_transfers" ADD CONSTRAINT "credit_wallet_transfers_operator_user_id_fkey" FOREIGN KEY (operator_user_id) REFERENCES users(id);

ALTER TABLE "credit_wallet_transfers" ADD CONSTRAINT "credit_wallet_transfers_source_ledger_entry_id_fkey" FOREIGN KEY (source_ledger_entry_id) REFERENCES credit_ledger_entries(id);

ALTER TABLE "credit_wallet_transfers" ADD CONSTRAINT "credit_wallet_transfers_source_user_id_fkey" FOREIGN KEY (source_user_id) REFERENCES users(id);

ALTER TABLE "credit_wallet_transfers" ADD CONSTRAINT "credit_wallet_transfers_target_ledger_entry_id_fkey" FOREIGN KEY (target_ledger_entry_id) REFERENCES credit_ledger_entries(id);

ALTER TABLE "credit_wallet_transfers" ADD CONSTRAINT "credit_wallet_transfers_target_team_member_fkey" FOREIGN KEY (target_team_member_id, source_user_id) REFERENCES team_members(id, user_id);

ALTER TABLE "episode_asset_conversation_messages" ADD CONSTRAINT "episode_asset_conversation_messages_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "episode_asset_conversation_messages" ADD CONSTRAINT "episode_asset_conversation_messages_thread_id_fkey" FOREIGN KEY (thread_id) REFERENCES episode_asset_conversation_threads(id) ON DELETE CASCADE;

ALTER TABLE "episode_asset_conversation_threads" ADD CONSTRAINT "episode_asset_conversation_threads_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "episode_asset_conversation_threads" ADD CONSTRAINT "episode_asset_conversation_threads_episode_id_fkey" FOREIGN KEY (episode_id) REFERENCES episodes(id);

ALTER TABLE "episode_asset_conversation_threads" ADD CONSTRAINT "episode_asset_conversation_threads_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "episode_generation_drafts" ADD CONSTRAINT "episode_generation_drafts_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "episode_generation_drafts" ADD CONSTRAINT "episode_generation_drafts_episode_id_fkey" FOREIGN KEY (episode_id) REFERENCES episodes(id);

ALTER TABLE "episode_generation_drafts" ADD CONSTRAINT "episode_generation_drafts_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "episodes" ADD CONSTRAINT "episodes_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "episodes" ADD CONSTRAINT "episodes_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "export_records" ADD CONSTRAINT "export_records_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "export_records" ADD CONSTRAINT "export_records_episode_fkey" FOREIGN KEY (episode_id) REFERENCES episodes(id);

ALTER TABLE "export_records" ADD CONSTRAINT "export_records_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "export_records" ADD CONSTRAINT "export_records_storage_object_id_fkey" FOREIGN KEY (storage_object_id) REFERENCES storage_objects(id);

ALTER TABLE "export_records" ADD CONSTRAINT "export_records_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES workflows(id);

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_admin_account_id_fkey" FOREIGN KEY (admin_account_id) REFERENCES admin_accounts(id);

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "image_prompt_styles" ADD CONSTRAINT "image_prompt_styles_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "image_prompt_styles" ADD CONSTRAINT "image_prompt_styles_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "inbox_events" ADD CONSTRAINT "inbox_events_outbox_event_id_fkey" FOREIGN KEY (outbox_event_id) REFERENCES outbox_events(id);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_inviter_plan_id_fkey" FOREIGN KEY (inviter_plan_id) REFERENCES membership_plans(id);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_new_user_plan_id_fkey" FOREIGN KEY (new_user_plan_id) REFERENCES membership_plans(id);

ALTER TABLE "invite_reward_configs" ADD CONSTRAINT "invite_reward_configs_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "invite_reward_grants" ADD CONSTRAINT "invite_reward_grants_binding_id_fkey" FOREIGN KEY (binding_id) REFERENCES user_invite_bindings(id);

ALTER TABLE "invite_reward_grants" ADD CONSTRAINT "invite_reward_grants_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES users(id);

ALTER TABLE "library_asset_versions" ADD CONSTRAINT "library_asset_versions_library_asset_id_fkey" FOREIGN KEY (library_asset_id) REFERENCES library_assets(id);

ALTER TABLE "library_assets" ADD CONSTRAINT "library_assets_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "library_assets" ADD CONSTRAINT "library_assets_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_order_fkey" FOREIGN KEY (order_id) REFERENCES billing_orders(id);

ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES membership_plans(id);

ALTER TABLE "membership_periods" ADD CONSTRAINT "membership_periods_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "membership_plan_revisions" ADD CONSTRAINT "membership_plan_revisions_changed_by_admin_id_fkey" FOREIGN KEY (changed_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "membership_plan_revisions" ADD CONSTRAINT "membership_plan_revisions_plan_id_fkey" FOREIGN KEY (plan_id) REFERENCES membership_plans(id);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "membership_reminders" ADD CONSTRAINT "membership_reminders_membership_period_id_fkey" FOREIGN KEY (membership_period_id) REFERENCES membership_periods(id);

ALTER TABLE "membership_reminders" ADD CONSTRAINT "membership_reminders_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "outbox_events" ADD CONSTRAINT "outbox_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_idempotency_record_id_fkey" FOREIGN KEY (idempotency_record_id) REFERENCES idempotency_records(id);

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_order_id_fkey" FOREIGN KEY (order_id) REFERENCES billing_orders(id);

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_order_id_fkey" FOREIGN KEY (order_id) REFERENCES billing_orders(id);

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_payment_intent_id_fkey" FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id);

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_provider_event_id_fkey" FOREIGN KEY (provider_event_id) REFERENCES payment_provider_events(id);

ALTER TABLE "payment_logs" ADD CONSTRAINT "payment_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES billing_orders(id);

ALTER TABLE "payment_provider_events" ADD CONSTRAINT "payment_provider_events_payment_intent_id_fkey" FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id);

ALTER TABLE "payment_reconciliation_items" ADD CONSTRAINT "payment_reconciliation_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES billing_orders(id);

ALTER TABLE "payment_reconciliation_items" ADD CONSTRAINT "payment_reconciliation_items_payment_intent_id_fkey" FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id);

ALTER TABLE "payment_reconciliation_items" ADD CONSTRAINT "payment_reconciliation_items_run_id_fkey" FOREIGN KEY (run_id) REFERENCES payment_reconciliation_runs(id);

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_order_id_fkey" FOREIGN KEY (order_id) REFERENCES billing_orders(id);

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_payment_intent_id_fkey" FOREIGN KEY (payment_intent_id) REFERENCES payment_intents(id);

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_provider_event_id_fkey" FOREIGN KEY (provider_event_id) REFERENCES payment_provider_events(id);

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_reviewed_by_admin_account_id_fkey" FOREIGN KEY (reviewed_by_admin_account_id) REFERENCES admin_accounts(id);

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_reviewed_by_user_id_fkey" FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id);

ALTER TABLE "payment_risk_events" ADD CONSTRAINT "payment_risk_events_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "project_upload_records" ADD CONSTRAINT "project_upload_records_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES users(id);

ALTER TABLE "project_upload_records" ADD CONSTRAINT "project_upload_records_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "project_upload_records" ADD CONSTRAINT "project_upload_records_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "project_upload_records" ADD CONSTRAINT "project_upload_records_single_owner_scope_check" CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE "project_upload_records" ADD CONSTRAINT "project_upload_records_storage_object_id_fkey" FOREIGN KEY (storage_object_id) REFERENCES storage_objects(id);

ALTER TABLE "project_upload_records" ADD CONSTRAINT "project_upload_records_upload_session_id_fkey" FOREIGN KEY (upload_session_id) REFERENCES storage_upload_sessions(id);

ALTER TABLE "project_source_documents" ADD CONSTRAINT "project_source_documents_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "project_source_documents" ADD CONSTRAINT "project_source_documents_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE "projects" ADD CONSTRAINT "projects_cover_storage_object_id_fkey" FOREIGN KEY (cover_storage_object_id) REFERENCES storage_objects(id);

ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE "prop_prompt_templates" ADD CONSTRAINT "prop_prompt_templates_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "prop_prompt_templates" ADD CONSTRAINT "prop_prompt_templates_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES task_attempts(id);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_single_owner_scope_check" CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE "provider_requests" ADD CONSTRAINT "provider_requests_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES workflows(id);

ALTER TABLE "runtime_config_entries" ADD CONSTRAINT "runtime_config_entries_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "runtime_config_revisions" ADD CONSTRAINT "runtime_config_revisions_changed_by_admin_id_fkey" FOREIGN KEY (changed_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "scene_prompt_templates" ADD CONSTRAINT "scene_prompt_templates_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "scene_prompt_templates" ADD CONSTRAINT "scene_prompt_templates_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "script_reader_sections" ADD CONSTRAINT "script_reader_sections_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "script_reader_sections" ADD CONSTRAINT "script_reader_sections_script_id_fkey" FOREIGN KEY (script_id) REFERENCES scripts(id);

ALTER TABLE "scripts" ADD CONSTRAINT "scripts_cover_storage_object_id_fkey" FOREIGN KEY (cover_storage_object_id) REFERENCES storage_objects(id);

ALTER TABLE "scripts" ADD CONSTRAINT "scripts_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "scripts" ADD CONSTRAINT "scripts_owner_user_id_fkey" FOREIGN KEY (owner_user_id) REFERENCES users(id);

ALTER TABLE "shot_prompt_templates" ADD CONSTRAINT "shot_prompt_templates_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "shot_prompt_templates" ADD CONSTRAINT "shot_prompt_templates_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "shot_reference_assets" ADD CONSTRAINT "shot_reference_assets_asset_id_fkey" FOREIGN KEY (asset_id) REFERENCES assets(id);

ALTER TABLE "shot_reference_assets" ADD CONSTRAINT "shot_reference_assets_asset_version_id_fkey" FOREIGN KEY (asset_version_id) REFERENCES asset_versions(id);

ALTER TABLE "shot_reference_assets" ADD CONSTRAINT "shot_reference_assets_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "shot_reference_assets" ADD CONSTRAINT "shot_reference_assets_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "shot_reference_assets" ADD CONSTRAINT "shot_reference_assets_shot_id_fkey" FOREIGN KEY (shot_id) REFERENCES shots(id);

ALTER TABLE "shots" ADD CONSTRAINT "shots_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "shots" ADD CONSTRAINT "shots_episode_fkey" FOREIGN KEY (episode_id) REFERENCES episodes(id);

ALTER TABLE "shots" ADD CONSTRAINT "shots_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "sms_send_records" ADD CONSTRAINT "sms_send_records_challenge_id_fkey" FOREIGN KEY (challenge_id) REFERENCES login_challenges(id);

ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_single_owner_scope_check" CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE "storage_upload_sessions" ADD CONSTRAINT "storage_upload_sessions_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "storage_upload_sessions" ADD CONSTRAINT "storage_upload_sessions_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "storage_upload_sessions" ADD CONSTRAINT "storage_upload_sessions_storage_object_id_fkey" FOREIGN KEY (storage_object_id) REFERENCES storage_objects(id);

ALTER TABLE "storyboard_prompt_package_versions" ADD CONSTRAINT "storyboard_prompt_package_versions_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "storyboard_prompt_package_versions" ADD CONSTRAINT "storyboard_prompt_package_versions_package_id_fkey" FOREIGN KEY (package_id) REFERENCES storyboard_prompt_packages(id);

ALTER TABLE "storyboard_prompt_packages" ADD CONSTRAINT "storyboard_prompt_packages_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "storyboard_prompt_packages" ADD CONSTRAINT "storyboard_prompt_packages_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "storyboard_prompt_templates" ADD CONSTRAINT "storyboard_prompt_templates_created_by_admin_id_fkey" FOREIGN KEY (created_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "storyboard_prompt_templates" ADD CONSTRAINT "storyboard_prompt_templates_genre_package_id_fkey" FOREIGN KEY (genre_package_id) REFERENCES storyboard_prompt_packages(id);

ALTER TABLE "storyboard_prompt_templates" ADD CONSTRAINT "storyboard_prompt_templates_output_package_id_fkey" FOREIGN KEY (output_package_id) REFERENCES storyboard_prompt_packages(id);

ALTER TABLE "storyboard_prompt_templates" ADD CONSTRAINT "storyboard_prompt_templates_updated_by_admin_id_fkey" FOREIGN KEY (updated_by_admin_id) REFERENCES admin_accounts(id);

ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_project_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_single_owner_scope_check" CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE "task_attempts" ADD CONSTRAINT "task_attempts_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES workflows(id);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_current_attempt_fkey" FOREIGN KEY (current_attempt_id) REFERENCES task_attempts(id) DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_idempotency_record_id_fkey" FOREIGN KEY (idempotency_record_id) REFERENCES idempotency_records(id);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_single_owner_scope_check" CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES workflows(id);

ALTER TABLE "team_assets" ADD CONSTRAINT "team_assets_admin_user_id_fkey" FOREIGN KEY (admin_user_id) REFERENCES users(id);

ALTER TABLE "team_member_auth_sessions" ADD CONSTRAINT "team_member_auth_sessions_auth_session_id_fkey" FOREIGN KEY (auth_session_id) REFERENCES auth_sessions(id);

ALTER TABLE "team_member_auth_sessions" ADD CONSTRAINT "team_member_auth_sessions_member_id_user_id_fkey" FOREIGN KEY (member_id, user_id) REFERENCES team_members(id, user_id);

ALTER TABLE "team_member_auth_sessions" ADD CONSTRAINT "team_member_auth_sessions_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "team_member_canvases" ADD CONSTRAINT "team_member_canvases_canvas_id_fkey" FOREIGN KEY (canvas_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "team_member_canvases" ADD CONSTRAINT "team_member_canvases_member_id_user_id_fkey" FOREIGN KEY (member_id, user_id) REFERENCES team_members(id, user_id);

ALTER TABLE "team_member_canvases" ADD CONSTRAINT "team_member_canvases_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "team_member_project_records" ADD CONSTRAINT "team_member_project_records_member_id_user_id_fkey" FOREIGN KEY (member_id, user_id) REFERENCES team_members(id, user_id);

ALTER TABLE "team_member_project_records" ADD CONSTRAINT "team_member_project_records_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "team_member_project_records" ADD CONSTRAINT "team_member_project_records_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "team_member_projects" ADD CONSTRAINT "team_member_projects_member_id_user_id_fkey" FOREIGN KEY (member_id, user_id) REFERENCES team_members(id, user_id);

ALTER TABLE "team_member_projects" ADD CONSTRAINT "team_member_projects_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "team_member_projects" ADD CONSTRAINT "team_member_projects_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "team_member_scripts" ADD CONSTRAINT "team_member_scripts_member_id_user_id_fkey" FOREIGN KEY (member_id, user_id) REFERENCES team_members(id, user_id);

ALTER TABLE "team_member_scripts" ADD CONSTRAINT "team_member_scripts_script_id_fkey" FOREIGN KEY (script_id) REFERENCES scripts(id);

ALTER TABLE "team_member_scripts" ADD CONSTRAINT "team_member_scripts_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "team_members" ADD CONSTRAINT "team_members_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "user_entitlements" ADD CONSTRAINT "user_entitlements_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "user_invite_bindings" ADD CONSTRAINT "user_invite_bindings_invited_user_id_fkey" FOREIGN KEY (invited_user_id) REFERENCES users(id);

ALTER TABLE "user_invite_bindings" ADD CONSTRAINT "user_invite_bindings_inviter_user_id_fkey" FOREIGN KEY (inviter_user_id) REFERENCES users(id);

ALTER TABLE "user_memberships" ADD CONSTRAINT "user_memberships_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_attempt_id_fkey" FOREIGN KEY (attempt_id) REFERENCES task_attempts(id);

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_project_id_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_single_owner_scope_check" CHECK (project_id IS NULL OR canvas_project_id IS NULL);

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_provider_request_id_fkey" FOREIGN KEY (provider_request_id) REFERENCES provider_requests(id) ON DELETE CASCADE;

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_task_id_fkey" FOREIGN KEY (task_id) REFERENCES tasks(id);

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_user_id_fkey" FOREIGN KEY (user_id) REFERENCES users(id);

ALTER TABLE "user_model_request_logs" ADD CONSTRAINT "user_model_request_logs_workflow_id_fkey" FOREIGN KEY (workflow_id) REFERENCES workflows(id);

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_created_by_user_id_fkey" FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_idempotency_record_id_fkey" FOREIGN KEY (idempotency_record_id) REFERENCES idempotency_records(id);

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_project_fkey" FOREIGN KEY (project_id) REFERENCES projects(id);

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_canvas_project_id_fkey" FOREIGN KEY (canvas_project_id) REFERENCES creator_canvas_projects(id);

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_single_owner_scope_check" CHECK (project_id IS NULL OR canvas_project_id IS NULL);

CREATE INDEX IF NOT EXISTS admin_account_roles_account_idx ON admin_account_roles USING btree (admin_account_id, role_code);

CREATE INDEX IF NOT EXISTS admin_accounts_status_login_idx ON admin_accounts USING btree (status, login_name);

CREATE UNIQUE INDEX IF NOT EXISTS admin_accounts_super_admin_slot_unique ON admin_accounts USING btree (super_admin_slot) WHERE (super_admin_slot IS NOT NULL);

CREATE INDEX IF NOT EXISTS admin_auth_sessions_account_expiry_idx ON admin_auth_sessions USING btree (admin_account_id, expires_at, revoked_at);

CREATE INDEX IF NOT EXISTS admin_secret_references_env_status_idx ON admin_secret_references USING btree (env_name, status);

CREATE INDEX IF NOT EXISTS admin_secret_values_status_key_idx ON admin_secret_values USING btree (status, secret_key);

CREATE INDEX IF NOT EXISTS ai_generation_task_snapshots_target_user_idx ON ai_generation_task_snapshots USING btree (user_id, episode_id, target_type, target_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ai_generation_task_snapshots_task_uidx ON ai_generation_task_snapshots USING btree (task_id);

CREATE INDEX IF NOT EXISTS ai_generation_task_snapshots_user_status_idx ON ai_generation_task_snapshots USING btree (user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_generation_task_snapshots_user_updated_task_idx ON ai_generation_task_snapshots USING btree (user_id, updated_at DESC, task_id DESC);

CREATE INDEX IF NOT EXISTS generation_snapshots_canvas_created_idx ON ai_generation_task_snapshots USING btree (canvas_project_id, created_at DESC) WHERE (canvas_project_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS ai_model_config_revisions_model_created_idx ON ai_model_config_revisions USING btree (model_config_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_model_configs_lookup_idx ON ai_model_configs USING btree (status, media_type, sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS ai_model_configs_provider_idx ON ai_model_configs USING btree (provider_name, provider_protocol, status);

CREATE INDEX IF NOT EXISTS ai_model_configs_task_modes_gin_idx ON ai_model_configs USING gin (task_modes_json);

CREATE INDEX IF NOT EXISTS ai_model_dispatch_policies_model_idx ON ai_model_dispatch_policies USING btree (model_config_id, status);

CREATE INDEX IF NOT EXISTS ai_model_dispatch_policies_queue_idx ON ai_model_dispatch_policies USING btree (queue_backend, submit_queue_name, status);

CREATE INDEX IF NOT EXISTS generation_queue_shards_accepting_idx ON generation_queue_shards USING btree (media_type, stage, route_key, shard_no DESC) WHERE (state = 'accepting'::text);

CREATE INDEX IF NOT EXISTS generation_queue_stage_assignments_shard_status_idx ON generation_queue_stage_assignments USING btree (shard_id, status);

CREATE INDEX IF NOT EXISTS generation_queue_stage_assignments_task_idx ON generation_queue_stage_assignments USING btree (task_id, stage, created_at DESC);

CREATE INDEX IF NOT EXISTS generation_stage_successors_orphan_idx ON generation_stage_successors USING btree (status, last_observed_at, task_id) WHERE (status = 'scheduled'::text);

CREATE INDEX IF NOT EXISTS announcements_active_window_idx ON announcements USING btree (status, starts_at, ends_at, sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS announcements_admin_list_idx ON announcements USING btree (status, sort_order, updated_at DESC);

CREATE INDEX IF NOT EXISTS asset_review_candidates_project_created_idx ON asset_review_candidates USING btree (project_id, candidate_group, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS asset_review_candidates_project_key_uidx ON asset_review_candidates USING btree (project_id, candidate_group, asset_key);

CREATE INDEX IF NOT EXISTS assets_project_created_idx ON assets USING btree (project_id, asset_type, created_at DESC);

CREATE INDEX IF NOT EXISTS assets_canvas_created_idx ON assets USING btree (canvas_project_id, asset_type, created_at DESC) WHERE (canvas_project_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS assets_canvas_type_key_uidx ON assets USING btree (canvas_project_id, asset_type, asset_key) WHERE (canvas_project_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS assets_project_type_key_uidx ON assets USING btree (project_id, asset_type, asset_key);

CREATE INDEX IF NOT EXISTS asset_versions_asset_created_idx ON asset_versions USING btree (asset_id, version_number DESC);

CREATE UNIQUE INDEX IF NOT EXISTS asset_versions_asset_version_uidx ON asset_versions USING btree (asset_id, version_number);

CREATE INDEX IF NOT EXISTS asset_versions_storage_object_idx ON asset_versions USING btree (storage_object_id) WHERE (storage_object_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS audit_events_admin_actor_created_idx ON audit_events USING btree (actor_admin_account_id, created_at DESC) WHERE (actor_admin_account_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS audit_events_project_created_user_idx ON audit_events USING btree (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS audit_events_user_created_idx ON audit_events USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS billing_orders_paid_without_credit_user_idx ON billing_orders USING btree (created_by_user_id, paid_at DESC) WHERE ((status = 'paid'::text) AND (product_type = 'credit_package'::text) AND (credit_grant_ledger_entry_id IS NULL));

CREATE UNIQUE INDEX IF NOT EXISTS billing_orders_user_idempotency_uidx ON billing_orders USING btree (created_by_user_id, idempotency_record_id) WHERE (idempotency_record_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS billing_orders_user_status_idx ON billing_orders USING btree (created_by_user_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS calibration_items_session_user_idx ON calibration_items USING btree (calibration_session_id);

CREATE INDEX IF NOT EXISTS calibration_sessions_project_created_idx ON calibration_sessions USING btree (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS character_prompt_templates_stage_status_idx ON character_prompt_templates USING btree (stage, status, sort_order DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS creator_canvas_documents_latest_user_idx ON creator_canvas_documents USING btree (canvas_project_id, server_revision DESC);

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_documents_revision_uidx ON creator_canvas_documents USING btree (canvas_project_id, server_revision);

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_edges_key_uidx ON creator_canvas_edges USING btree (canvas_project_id, edge_key);

CREATE INDEX IF NOT EXISTS creator_canvas_events_revision_idx ON creator_canvas_events USING btree (canvas_project_id, server_revision DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS creator_canvas_node_artifacts_node_idx ON creator_canvas_node_artifacts USING btree (canvas_project_id, node_key, created_at DESC) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_node_artifacts_selected_role_uidx ON creator_canvas_node_artifacts USING btree (canvas_project_id, node_key, selection_role) WHERE ((deleted_at IS NULL) AND (selected = true));

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_node_runs_canvas_idempotency_uidx ON creator_canvas_node_runs USING btree (canvas_project_id, idempotency_key);

CREATE INDEX IF NOT EXISTS creator_canvas_node_runs_node_idx ON creator_canvas_node_runs USING btree (canvas_project_id, node_key, run_no DESC);

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_node_runs_node_run_uidx ON creator_canvas_node_runs USING btree (canvas_project_id, node_key, run_no);

CREATE INDEX IF NOT EXISTS creator_canvas_nodes_canvas_idx ON creator_canvas_nodes USING btree (canvas_project_id, sort_order, created_at) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_nodes_key_uidx ON creator_canvas_nodes USING btree (canvas_project_id, node_key);

CREATE INDEX IF NOT EXISTS creator_canvas_projects_user_created_idx ON creator_canvas_projects USING btree (created_by_user_id, created_at DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS creator_canvas_revisions_latest_idx ON creator_canvas_revisions USING btree (canvas_project_id, server_revision DESC);

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_revisions_revision_uidx ON creator_canvas_revisions USING btree (canvas_project_id, server_revision);

CREATE UNIQUE INDEX IF NOT EXISTS creator_canvas_sessions_user_uidx ON creator_canvas_sessions USING btree (canvas_project_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_entries_allocation_settlement_unique ON credit_ledger_entries USING btree (allocation_id) WHERE ((allocation_id IS NOT NULL) AND (entry_type = ANY (ARRAY['consume'::text, 'release'::text])));

CREATE INDEX IF NOT EXISTS credit_ledger_entries_reservation_idx ON credit_ledger_entries USING btree (user_id, reservation_id, allocation_id) WHERE (reservation_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_entries_reservation_unique ON credit_ledger_entries USING btree (reservation_id) WHERE ((reservation_id IS NOT NULL) AND (entry_type = 'reservation'::text));

CREATE INDEX IF NOT EXISTS credit_ledger_entries_user_created_idx ON credit_ledger_entries USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_user_source_entry_key ON credit_ledger_entries USING btree (user_id, source_type, source_id, entry_type);

CREATE INDEX IF NOT EXISTS credit_lots_frozen_expiry_idx ON credit_lots USING btree (frozen_until, created_at) WHERE ((status = 'frozen'::text) AND (available_amount > 0));

CREATE INDEX IF NOT EXISTS credit_lots_spend_order_idx ON credit_lots USING btree (user_id, expires_at, created_at) WHERE ((available_amount > 0) AND (status = 'active'::text));

CREATE UNIQUE INDEX IF NOT EXISTS credit_lots_user_source_grant_key ON credit_lots USING btree (user_id, source_type, source_id, grant_ledger_entry_id);

CREATE INDEX IF NOT EXISTS credit_lots_user_spend_order_idx ON credit_lots USING btree (user_id, expires_at, created_at) WHERE ((user_id IS NOT NULL) AND (available_amount > 0));

CREATE INDEX IF NOT EXISTS credit_packages_active_idx ON credit_packages USING btree (status, sort_order, amount_minor, valid_from, valid_until);

CREATE INDEX IF NOT EXISTS credit_reservation_allocations_status_idx ON credit_reservation_allocations USING btree (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS credit_reservation_allocations_user_status_idx ON credit_reservation_allocations USING btree (user_id, status, created_at DESC) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS credit_reservation_lot_allocations_reservation_idx ON credit_reservation_lot_allocations USING btree (user_id, reservation_id, status);

CREATE INDEX IF NOT EXISTS credit_reservation_lot_allocations_user_reservation_idx ON credit_reservation_lot_allocations USING btree (user_id, reservation_id, status) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS credit_reservations_status_idx ON credit_reservations USING btree (user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS credit_reservations_user_source_key ON credit_reservations USING btree (user_id, source_type, source_id);

CREATE INDEX IF NOT EXISTS credit_reservations_user_status_idx ON credit_reservations USING btree (user_id, status, created_at DESC) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS credit_reservations_canvas_created_idx ON credit_reservations USING btree (canvas_project_id, created_at DESC) WHERE (canvas_project_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS credit_wallet_transfers_target_idx ON credit_wallet_transfers USING btree (target_team_member_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS credit_wallet_transfers_user_idempotency_key ON credit_wallet_transfers USING btree (source_user_id, operator_user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS episode_asset_conversation_messages_thread_idx ON episode_asset_conversation_messages USING btree (thread_id, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS episode_asset_conversation_threads_lookup_uidx ON episode_asset_conversation_threads USING btree (project_id, episode_id, asset_id, media_mode);

CREATE INDEX IF NOT EXISTS episode_generation_drafts_episode_updated_idx ON episode_generation_drafts USING btree (episode_id, target_type, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS episode_generation_drafts_target_uidx ON episode_generation_drafts USING btree (episode_id, target_type, target_id, mode);

CREATE INDEX IF NOT EXISTS episodes_project_created_idx ON episodes USING btree (project_id, sequence, created_at);

CREATE UNIQUE INDEX IF NOT EXISTS episodes_project_sequence_uidx ON episodes USING btree (project_id, sequence);

CREATE INDEX IF NOT EXISTS export_records_episode_idx ON export_records USING btree (episode_id) WHERE (episode_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS export_records_project_created_idx ON export_records USING btree (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idempotency_records_admin_processing_idx ON idempotency_records USING btree (admin_account_id, operation_name, status, locked_until) WHERE (admin_account_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idempotency_records_expiry_idx ON idempotency_records USING btree (expires_at) WHERE (status = ANY (ARRAY['succeeded'::text, 'failed_terminal'::text, 'expired'::text]));

CREATE UNIQUE INDEX IF NOT EXISTS idempotency_records_scope_key_unique ON idempotency_records USING btree (scope_key, operation_name, idempotency_key);

CREATE INDEX IF NOT EXISTS idempotency_records_user_processing_idx ON idempotency_records USING btree (user_id, operation_name, status, locked_until) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS image_prompt_styles_lookup_idx ON image_prompt_styles USING btree (category, model_family, status, sort_order DESC) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS invite_reward_configs_single_active_idx ON invite_reward_configs USING btree (status) WHERE (status = 'active'::text);

CREATE INDEX IF NOT EXISTS invite_reward_grants_recipient_idx ON invite_reward_grants USING btree (recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS library_assets_owner_scope_idx ON library_assets USING btree (owner_user_id, scope, category, folder, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS library_asset_versions_asset_idx ON library_asset_versions USING btree (library_asset_id, version_number DESC);

CREATE INDEX IF NOT EXISTS login_challenges_phone_status_idx ON login_challenges USING btree (phone_e164, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS membership_periods_user_order_key ON membership_periods USING btree (user_id, order_id);

CREATE INDEX IF NOT EXISTS membership_periods_user_status_idx ON membership_periods USING btree (user_id, status, period_end_at DESC);

CREATE INDEX IF NOT EXISTS membership_plan_revisions_plan_idx ON membership_plan_revisions USING btree (plan_id, created_at DESC);

CREATE INDEX IF NOT EXISTS membership_plans_active_idx ON membership_plans USING btree (tier, period_unit, period_count, valid_from, valid_until) WHERE (status = 'active'::text);

CREATE INDEX IF NOT EXISTS membership_plans_visibility_status_idx ON membership_plans USING btree (visibility, status, usage_scene);

CREATE INDEX IF NOT EXISTS membership_reminders_due_user_idx ON membership_reminders USING btree (remind_at, user_id) WHERE (delivered_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS membership_reminders_user_period_key ON membership_reminders USING btree (user_id, membership_period_id, reminder_key);

CREATE INDEX IF NOT EXISTS outbox_events_user_status_idx ON outbox_events USING btree (user_id, status, available_at);
CREATE INDEX IF NOT EXISTS outbox_events_generation_route_stage_idx ON outbox_events USING btree (generation_stage, provider_route_key, available_at, id) WHERE ((event_type ~~ 'generation.task.%'::text) AND (status = ANY (ARRAY['pending'::text, 'failed'::text])));
CREATE UNIQUE INDEX IF NOT EXISTS outbox_events_active_dedupe_idx ON outbox_events USING btree (dedupe_key) WHERE ((dedupe_key IS NOT NULL) AND (status = ANY (ARRAY['pending'::text, 'processing'::text, 'failed'::text])));

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_order_success_uidx ON payment_intents USING btree (order_id) WHERE (status = 'succeeded'::text);

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_trade_uidx ON payment_intents USING btree (provider, provider_trade_id) WHERE (provider_trade_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_trade_unique ON payment_intents USING btree (provider, provider_trade_id) WHERE (provider_trade_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS payment_logs_request_time_idx ON payment_logs USING btree (provider, request_time DESC);

CREATE INDEX IF NOT EXISTS payment_logs_user_order_idx ON payment_logs USING btree (user_id, order_id, request_time DESC);

CREATE INDEX IF NOT EXISTS payment_provider_events_status_idx ON payment_provider_events USING btree (processing_status, received_at DESC);

CREATE INDEX IF NOT EXISTS payment_reconciliation_items_run_status_idx ON payment_reconciliation_items USING btree (run_id, status, issue_type, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_risk_events_user_status_idx ON payment_risk_events USING btree (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS projects_cover_storage_object_idx ON projects USING btree (cover_storage_object_id) WHERE (cover_storage_object_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS project_source_documents_project_uidx ON project_source_documents USING btree (project_id);

CREATE INDEX IF NOT EXISTS projects_owner_user_created_idx ON projects USING btree (owner_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_upload_records_actor_created_idx ON project_upload_records USING btree (actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_upload_records_project_created_idx ON project_upload_records USING btree (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_upload_records_status_idx ON project_upload_records USING btree (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS project_upload_records_upload_session_unique_idx ON project_upload_records USING btree (upload_session_id) WHERE (upload_session_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS project_upload_records_canvas_created_idx ON project_upload_records USING btree (canvas_project_id, created_at DESC) WHERE (canvas_project_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS prop_prompt_templates_lookup_idx ON prop_prompt_templates USING btree (stage, model_family, status, sort_order DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS provider_requests_repair_idx ON provider_requests USING btree (status, external_submission_started_at, updated_at);

CREATE INDEX IF NOT EXISTS provider_requests_creator_updated_id_idx ON provider_requests USING btree (created_by_user_id, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS provider_requests_task_idx ON provider_requests USING btree (task_id, attempt_id) WHERE (task_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS provider_requests_config_revision_idx ON provider_requests USING btree (provider_config_revision_id, created_at DESC) WHERE (provider_config_revision_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS provider_requests_due_poll_idx ON provider_requests USING btree (next_poll_at, id) WHERE ((next_poll_at IS NOT NULL) AND (status = ANY (ARRAY['submitted'::text, 'accepted'::text, 'running'::text, 'result_unknown'::text])));

CREATE INDEX IF NOT EXISTS provider_requests_canvas_created_idx ON provider_requests USING btree (canvas_project_id, created_at DESC) WHERE (canvas_project_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS provider_webhook_inbox_external_request_idx ON provider_webhook_inbox USING btree (provider_name, external_request_id, received_at DESC);

CREATE INDEX IF NOT EXISTS provider_webhook_inbox_pending_idx ON provider_webhook_inbox USING btree (status, received_at, id) WHERE (status = ANY (ARRAY['received'::text, 'failed'::text]));

CREATE INDEX IF NOT EXISTS runtime_config_revisions_key_created_idx ON runtime_config_revisions USING btree (config_key, created_at DESC);

CREATE INDEX IF NOT EXISTS scene_prompt_templates_lookup_idx ON scene_prompt_templates USING btree (stage, model_family, status, sort_order DESC) WHERE (deleted_at IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS script_reader_sections_script_sequence_uidx ON script_reader_sections USING btree (script_id, sequence);

CREATE INDEX IF NOT EXISTS scripts_owner_active_idx ON scripts USING btree (owner_user_id, updated_at DESC, id DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS shot_prompt_templates_lookup_idx ON shot_prompt_templates USING btree (stage, model_family, status, sort_order DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS shot_reference_assets_shot_sort_idx ON shot_reference_assets USING btree (project_id, shot_id, sort_order);

CREATE INDEX IF NOT EXISTS shots_episode_sort_user_idx ON shots USING btree (episode_id, sort_order, created_at) WHERE (episode_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS shots_project_created_idx ON shots USING btree (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_send_records_ip_created_idx ON sms_send_records USING btree (ip_address_hash, created_at DESC) WHERE (ip_address_hash IS NOT NULL);

CREATE INDEX IF NOT EXISTS sms_send_records_phone_created_idx ON sms_send_records USING btree (phone_e164, created_at DESC);

CREATE INDEX IF NOT EXISTS sms_send_records_phone_status_created_idx ON sms_send_records USING btree (phone_e164, status, created_at DESC);

CREATE INDEX IF NOT EXISTS storage_objects_project_created_idx ON storage_objects USING btree (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS storage_objects_canvas_created_idx ON storage_objects USING btree (canvas_project_id, created_at DESC) WHERE (canvas_project_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS storage_objects_status_idx ON storage_objects USING btree (status, created_at DESC);

CREATE INDEX IF NOT EXISTS storage_upload_sessions_project_created_idx ON storage_upload_sessions USING btree (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS storage_upload_sessions_status_idx ON storage_upload_sessions USING btree (status, expires_at);

CREATE UNIQUE INDEX IF NOT EXISTS storage_upload_sessions_user_idempotency_uidx ON storage_upload_sessions USING btree (created_by_user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS storyboard_prompt_packages_type_status_idx ON storyboard_prompt_packages USING btree (package_type, status, sort_order DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS storyboard_prompt_package_versions_package_idx ON storyboard_prompt_package_versions USING btree (package_id, version_no DESC);

CREATE INDEX IF NOT EXISTS storyboard_prompt_templates_status_idx ON storyboard_prompt_templates USING btree (status, sort_order DESC) WHERE (deleted_at IS NULL);

CREATE INDEX IF NOT EXISTS task_attempts_task_status_user_idx ON task_attempts USING btree (task_id, status);

CREATE INDEX IF NOT EXISTS tasks_dispatch_idx ON tasks USING btree (status, scheduled_at);

CREATE INDEX IF NOT EXISTS tasks_workflow_status_user_idx ON tasks USING btree (workflow_id, status);

CREATE INDEX IF NOT EXISTS tasks_canvas_status_idx ON tasks USING btree (canvas_project_id, status, created_at DESC) WHERE (canvas_project_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS team_assets_admin_category_idx ON team_assets USING btree (admin_user_id, asset_category, asset_status, updated_at DESC);

CREATE INDEX IF NOT EXISTS team_member_auth_sessions_member_idx ON team_member_auth_sessions USING btree (user_id, member_id, status, expires_at);

CREATE INDEX IF NOT EXISTS team_member_canvases_member_idx ON team_member_canvases USING btree (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_project_records_member_idx ON team_member_project_records USING btree (user_id, member_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_project_records_project_idx ON team_member_project_records USING btree (user_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_projects_member_idx ON team_member_projects USING btree (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_projects_user_project_idx ON team_member_projects USING btree (user_id, project_id);

CREATE INDEX IF NOT EXISTS team_member_scripts_member_idx ON team_member_scripts USING btree (member_id, created_at DESC);

CREATE INDEX IF NOT EXISTS team_member_scripts_user_script_idx ON team_member_scripts USING btree (user_id, script_id);

CREATE INDEX IF NOT EXISTS team_members_login_account_idx ON team_members USING btree (member_login_account);

CREATE INDEX IF NOT EXISTS team_members_user_idx ON team_members USING btree (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS user_entitlements_status_idx ON user_entitlements USING btree (user_id, status, expires_at);

CREATE INDEX IF NOT EXISTS user_invite_bindings_inviter_idx ON user_invite_bindings USING btree (inviter_user_id, bound_at DESC);

CREATE INDEX IF NOT EXISTS user_invite_bindings_rebate_window_idx ON user_invite_bindings USING btree (invited_user_id, status, rebate_valid_until);

CREATE INDEX IF NOT EXISTS user_memberships_status_expiry_idx ON user_memberships USING btree (status, expires_at DESC);

CREATE INDEX IF NOT EXISTS user_model_request_logs_provider_request_idx ON user_model_request_logs USING btree (provider_request_id);

CREATE INDEX IF NOT EXISTS credit_reservation_allocations_provider_request_idx ON credit_reservation_allocations USING btree (provider_request_id) WHERE (provider_request_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS user_model_request_logs_user_created_idx ON user_model_request_logs USING btree (user_id, created_at DESC) WHERE (user_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS user_model_request_logs_canvas_created_idx ON user_model_request_logs USING btree (canvas_project_id, created_at DESC) WHERE (canvas_project_id IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code_key ON users USING btree (invite_code);

CREATE UNIQUE INDEX IF NOT EXISTS users_team_account_suffix_key ON users USING btree (team_account_suffix) WHERE (team_account_suffix IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS users_wechat_app_openid_unique ON users USING btree (wechat_app_id, wechat_openid) WHERE ((wechat_app_id IS NOT NULL) AND (wechat_openid IS NOT NULL));

CREATE UNIQUE INDEX IF NOT EXISTS users_wechat_app_unionid_unique ON users USING btree (wechat_app_id, wechat_unionid) WHERE ((wechat_app_id IS NOT NULL) AND (wechat_unionid IS NOT NULL));

CREATE INDEX IF NOT EXISTS workflows_user_status_idx ON workflows USING btree (created_by_user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS workflows_canvas_created_idx ON workflows USING btree (canvas_project_id, created_at DESC) WHERE (canvas_project_id IS NOT NULL);

CREATE OR REPLACE FUNCTION set_credit_ledger_balance_after()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  wallet_balance integer;
BEGIN
  IF NEW.balance_after IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.team_member_id IS NULL THEN
    SELECT credit_balance_cached
    INTO wallet_balance
    FROM users
    WHERE id = NEW.user_id;
  ELSE
    SELECT member_credits
    INTO wallet_balance
    FROM team_members
    WHERE id = NEW.team_member_id
      AND user_id = NEW.user_id;
  END IF;

  IF wallet_balance IS NULL THEN
    RAISE EXCEPTION 'credit_ledger_wallet_not_found';
  END IF;

  NEW.balance_after := wallet_balance;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_ledger_balance_after_trigger ON credit_ledger_entries;

CREATE TRIGGER credit_ledger_balance_after_trigger
BEFORE INSERT ON credit_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION set_credit_ledger_balance_after();

CREATE OR REPLACE FUNCTION prevent_credit_ledger_balance_after_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.balance_after IS DISTINCT FROM OLD.balance_after THEN
    RAISE EXCEPTION 'credit_ledger_balance_after_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS credit_ledger_balance_after_immutable_trigger ON credit_ledger_entries;

CREATE TRIGGER credit_ledger_balance_after_immutable_trigger
BEFORE UPDATE OF balance_after ON credit_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_credit_ledger_balance_after_update();

WITH generated_asset_results AS (
  SELECT
    av.id AS asset_version_id,
    COALESCE(
      NULLIF(av.metadata_json #>> '{generationResult,resultAssets,0,storageObjectId}', ''),
      NULLIF(av.metadata_json #>> '{generationResult,result,storageObjectId}', ''),
      NULLIF(av.metadata_json #>> '{generationResult,fixedImages,0,storageObjectId}', '')
    ) AS result_storage_object_id,
    COALESCE(
      NULLIF(av.metadata_json #>> '{generationResult,resultAssets,0,previewUrl}', ''),
      NULLIF(av.metadata_json #>> '{generationResult,resultAssets,0,sourceUrl}', ''),
      NULLIF(av.metadata_json #>> '{generationResult,result,imageUrl}', ''),
      NULLIF(av.metadata_json #>> '{generationResult,result,previewUrl}', ''),
      NULLIF(av.metadata_json #>> '{generationResult,fixedImages,0,previewUrl}', ''),
      NULLIF(av.metadata_json #>> '{generationResult,fixedImages,0,url}', '')
    ) AS result_preview_url
  FROM asset_versions av
  WHERE lower(COALESCE(
    av.metadata_json ->> 'generationStatus',
    av.metadata_json #>> '{generationResult,status}',
    av.metadata_json #>> '{generationResult,workflowStatus}',
    ''
  )) IN ('completed', 'succeeded', 'success')
), available_generated_assets AS (
  SELECT
    result.asset_version_id,
    result.result_preview_url,
    object.id AS storage_object_id,
    object.object_key,
    object.content_type
  FROM generated_asset_results result
  JOIN storage_objects object
    ON object.id::text = result.result_storage_object_id
   AND object.status = 'available'
)
UPDATE asset_versions version
SET storage_object_id = generated.storage_object_id,
    storage_object_key = generated.object_key,
    metadata_json = COALESCE(version.metadata_json, '{}'::jsonb)
      || jsonb_build_object(
        'fixedImageStorageObjectId', generated.storage_object_id,
        'storageObjectKey', generated.object_key
      )
      || CASE
        WHEN generated.result_preview_url IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object(
          'previewUrl', generated.result_preview_url,
          'fixedImageUrl', generated.result_preview_url,
          'sourceUrl', generated.result_preview_url,
          'downloadUrl', generated.result_preview_url
        )
      END
      || CASE
        WHEN generated.content_type IS NULL THEN '{}'::jsonb
        ELSE jsonb_build_object('mimeType', generated.content_type)
      END
FROM available_generated_assets generated
WHERE version.id = generated.asset_version_id
  AND (
    version.storage_object_id IS DISTINCT FROM generated.storage_object_id
    OR version.storage_object_key IS DISTINCT FROM generated.object_key
    OR (
      generated.result_preview_url IS NOT NULL
      AND version.metadata_json ->> 'previewUrl' IS DISTINCT FROM generated.result_preview_url
    )
  );

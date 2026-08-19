import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { SqlDatabase } from "./sql.ts";

const CURRENT_SCHEMA_RELATIVE_PATH = ["packages", "db", "baseline", "user-centric-schema.sql"];
const REFERENCE_SEED_RELATIVE_PATH = ["packages", "db", "baseline", "model-reference-seed.sql"];
const DIRECTOR_DESK_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260718-create-director-desks.sql"];
const TEAM_MEMBER_DIRECTOR_DESK_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260718-create-team-member-director-desks.sql"];
const ALIYUN_BAILIAN_AUDIO_MODEL_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-add-aliyun-bailian-audio-model.sql"];
const COSYVOICE_V2_CONTRACT_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-correct-cosyvoice-v2-contract.sql"];
const PROJECT_MULTI_CANVAS_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-enable-project-multi-canvases.sql"];
const CREATOR_AGENT_ASSETS_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-create-creator-agent-assets.sql"];
const CREATOR_BRAND_KITS_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260720-create-creator-brand-kits.sql"];
const GLOBALAIOPC_VIDEO_DOC_CONTRACT_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-align-globalaiopc-video-doc-contract.sql"];
const LINGDONG_API_DOC_CONTRACT_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-align-lingdong-api-doc-contract.sql"];
const CUMOB_IMAGE_CONTRACT_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-align-cumob-image-contract.sql"];
const CREATOR_TOOL_PRESETS_SCHEMA_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-create-creator-tool-presets.sql"];
const GENERATION_OUTBOX_RELIABILITY_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-generation-outbox-reliability.sql"];
const GENERATION_TIMEOUT_POLICY_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-unify-generation-timeout-policy.sql"];
const LEGACY_PROVIDER_CONFIG_CLEANUP_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-zz-remove-legacy-provider-configs.sql"];
const GENERATION_STRATEGY_OVERRIDE_CLEANUP_RELATIVE_PATH = ["packages", "db", "migrations", "20260721-z-remove-legacy-generation-strategy-overrides.sql"];
const CUMOB_ASYNC_POLLING_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-align-cumob-async-polling.sql"];
const GENERATION_QUEUE_ELASTIC_SHARDS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-queue-elastic-shards.sql"];
const GENERATION_QUEUE_LIFECYCLE_CORRECTION_RELATIVE_PATH = ["packages", "db", "migrations", "20260723-correct-generation-queue-lifecycle.sql"];
const GENERATION_QUEUE_DURABLE_LIFECYCLE_RELATIVE_PATH = ["packages", "db", "migrations", "20260724-durable-generation-queue-assignment-lifecycle.sql"];
const CANVAS_AGENT_RUNTIME_RELATIVE_PATH = ["packages", "db", "migrations", "20260725-create-canvas-agent-runtime.sql"];
const GENERATION_QUEUE_WORKER_LEASES_RELATIVE_PATH = ["packages", "db", "migrations", "20260725-generation-queue-worker-leases.sql"];
const GENERATION_QUEUE_ADMIN_COMMANDS_RELATIVE_PATH = ["packages", "db", "migrations", "20260725-z-generation-queue-admin-commands.sql"];
const GENERATION_QUEUE_JOB_CANCELLATIONS_RELATIVE_PATH = ["packages", "db", "migrations", "20260726-generation-queue-job-cancellations.sql"];
const GENERATION_QUEUE_PUBLISH_CANCELLATION_FENCING_RELATIVE_PATH = ["packages", "db", "migrations", "20260727-generation-queue-publish-cancellation-fencing.sql"];
const GENERATION_QUEUE_WORKER_LEASE_DB_CLOCK_RELATIVE_PATH = ["packages", "db", "migrations", "20260727-generation-queue-worker-lease-db-clock.sql"];
const CANVAS_ACTOR_PRINCIPALS_RELATIVE_PATH = ["packages", "db", "migrations", "20260728-canvas-actor-principals.sql"];
const COMFYUI_WORKFLOW_LIBRARY_RELATIVE_PATH = ["packages", "db", "migrations", "20260728-comfyui-workflow-library.sql"];
const LEGACY_WORKFLOW_RUNTIME_CLEANUP_RELATIVE_PATH = ["packages", "db", "migrations", "20260728-z-remove-legacy-workflow-runtime.sql"];
const CANVAS_GENERATION_RUNTIME_RELATIVE_PATH = ["packages", "db", "migrations", "20260729-canvas-generation-runtime.sql"];
const CANVAS_USER_CONFIG_LIBRARY_RELATIVE_PATH = ["packages", "db", "migrations", "20260729-canvas-user-config-library.sql"];
const PROMPT_MARKETPLACE_RELATIVE_PATH = ["packages", "db", "migrations", "20260729-create-prompt-marketplace.sql"];
const CANVAS_MEDIA_DERIVATIONS_RELATIVE_PATH = ["packages", "db", "migrations", "20260730-canvas-media-derivations.sql"];
const UNIFIED_PROMPT_STORAGE_RELATIVE_PATH = ["packages", "db", "migrations", "20260730-z-unify-prompt-storage.sql"];
const PROMPT_COVER_STORAGE_RELATIVE_PATH = ["packages", "db", "migrations", "20260730-zz-prompt-cover-storage.sql"];
const CANVAS_GENERATION_BATCH_BILLING_RELATIVE_PATH = ["packages", "db", "migrations", "20260731-canvas-generation-batch-billing.sql"];
const FAILED_IMAGE_SUBMISSION_ACTIVE_REPAIR_INDEX_RELATIVE_PATH = ["packages", "db", "migrations", "20260731-failed-image-submission-active-repair-index.sql"];
const FAILED_IMAGE_SUBMISSION_SNAPSHOT_REPAIR_INDEX_RELATIVE_PATH = ["packages", "db", "migrations", "20260731-failed-image-submission-snapshot-repair-index.sql"];
const CONCURRENT_MIGRATION_INDEX_NAMES = new Map([
  ["20260731-failed-image-submission-active-repair-index.sql", "tasks_failed_image_submission_active_repair_idx"],
  ["20260731-failed-image-submission-snapshot-repair-index.sql", "generation_snapshots_failed_image_submission_repair_idx"],
  ["20260824-z-task-center-provider-diagnostics-index.sql", "provider_requests_task_center_diagnostics_idx"],
  ["20260911-project-upload-storage-object-index.sql", "project_upload_records_storage_object_created_id_idx"],
]);
const CANVAS_AGENT_MODEL_PROBES_RELATIVE_PATH = ["packages", "db", "migrations", "20260731-z-canvas-agent-model-compatibility-probes.sql"];
const PROMPT_RATINGS_RELATIVE_PATH = ["packages", "db", "migrations", "20260801-z-create-prompt-ratings.sql"];
const PROMPT_RATING_SCORE_RELATIVE_PATH = ["packages", "db", "migrations", "20260801-zz-store-prompt-rating-score.sql"];
const CANVAS_SETTINGS_RELATIVE_PATH = ["packages", "db", "migrations", "20260802-canvas-settings.sql"];
const CANVAS_AGENT_CONVERSATION_PINS_RELATIVE_PATH = ["packages", "db", "migrations", "20260803-canvas-agent-conversation-pins.sql"];
const CANVAS_PROMPT_DIRECTIVE_CONFIGS_RELATIVE_PATH = ["packages", "db", "migrations", "20260804-canvas-prompt-directive-configs.sql"];
const CANVAS_AGENT_CONVERSATION_LOCKS_RELATIVE_PATH = ["packages", "db", "migrations", "20260805-canvas-agent-conversation-locks.sql"];
const PROMPT_SUMMARY_BACKFILL_RELATIVE_PATH = ["packages", "db", "migrations", "20260806-backfill-prompt-summaries.sql"];
const CANVAS_AGENT_PROVIDER_CONFIG_DRAFTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260807-canvas-agent-provider-config-drafts.sql"];
const CANVAS_AGENT_MEDIA_PROMPT_PREFERENCES_RELATIVE_PATH = ["packages", "db", "migrations", "20260808-canvas-agent-media-prompt-preferences.sql"];
const CANVAS_CHARACTER_LIBRARY_RELATIVE_PATH = ["packages", "db", "migrations", "20260809-canvas-character-library.sql"];
const CANVAS_AGENT_TEXT_MODEL_RELATIVE_PATH = ["packages", "db", "migrations", "20260809-z-enable-canvas-agent-text-model.sql"];
const CANVAS_AGENT_STRUCTURED_JSON_FALLBACK_RELATIVE_PATH = ["packages", "db", "migrations", "20260809-zz-canvas-agent-structured-json-fallback.sql"];
const CANVAS_AGENT_KNOWLEDGE_BOUNDARY_TABLES_RELATIVE_PATH = ["packages", "db", "migrations", "20260810-canvas-agent-knowledge-boundary-tables.sql"];
const CANVAS_AGENT_STEP_INPUT_JSON_RELATIVE_PATH = ["packages", "db", "migrations", "20260810-z-canvas-agent-step-input-json.sql"];
const PROMPT_SKILL_DEFAULTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260811-prompt-skill-defaults.sql"];
const CANVAS_AGENT_STEP_SKIP_RELATIVE_PATH = ["packages", "db", "migrations", "20260812-canvas-agent-step-skip.sql"];
const EXPANDED_PROMPT_SKILL_DEFAULTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260812-expand-prompt-skill-default-categories.sql"];
const OTHER_PROMPT_DEFAULT_RELATIVE_PATH = ["packages", "db", "migrations", "20260813-seed-other-prompt-default.sql"];
const REQUIRED_PROJECT_STYLE_RELATIVE_PATH = ["packages", "db", "migrations", "20260814-require-project-style.sql"];
const CANVAS_GENERATION_BATCH_TEXT_RELATIVE_PATH = ["packages", "db", "migrations", "20260815-canvas-generation-batch-text.sql"];
const CANVAS_STYLE_REFERENCE_ENABLED_RELATIVE_PATH = ["packages", "db", "migrations", "20260816-canvas-style-reference-enabled.sql"];
const TEAM_ASSETS_STORAGE_OBJECT_RELATIVE_PATH = ["packages", "db", "migrations", "20260817-team-assets-storage-object.sql"];
const TEAM_ASSETS_TAGS_RELATIVE_PATH = ["packages", "db", "migrations", "20260818-team-assets-tags.sql"];
const TEAM_ASSETS_FOLDERS_RELATIVE_PATH = ["packages", "db", "migrations", "20260819-team-assets-folders.sql"];
const CUMOB_TEXT_MODELS_RELATIVE_PATH = ["packages", "db", "migrations", "20260820-add-cumob-text-models.sql"];
const SCRIPT_OUTPUT_RULES_RELATIVE_PATH = ["packages", "db", "migrations", "20260821-append-script-output-rules.sql"];
const CANVAS_AGENT_WORKER_INDEXES_RELATIVE_PATH = ["packages", "db", "migrations", "20260822-canvas-agent-worker-indexes.sql"];
const CANVAS_AGENT_QUEUE_SHARDS_RELATIVE_PATH = ["packages", "db", "migrations", "20260823-canvas-agent-queue-shards.sql"];
const TASK_CENTER_PROVIDER_DIAGNOSTICS_RELATIVE_PATH = ["packages", "db", "migrations", "20260824-task-center-provider-diagnostics.sql"];
const TASK_CENTER_PROVIDER_DIAGNOSTICS_INDEX_RELATIVE_PATH = ["packages", "db", "migrations", "20260824-z-task-center-provider-diagnostics-index.sql"];
const TASK_CENTER_PROVIDER_DIAGNOSTICS_MIGRATION_NAME = "20260824-task-center-provider-diagnostics.sql";
const BANANAROUTER_IMAGE_ASYNC_RECOVERY_RELATIVE_PATH = ["packages", "db", "migrations", "20260825-bananarouter-image-async-recovery.sql"];
const PROVIDER_PROTOCOL_CONVERGENCE_RELATIVE_PATH = ["packages", "db", "migrations", "20260826-converge-provider-protocol-constraint.sql"];
const CANVAS_AGENT_SHARD_CONSTRAINT_CONVERGENCE_RELATIVE_PATH = ["packages", "db", "migrations", "20260827-converge-canvas-agent-shard-constraint.sql"];
const BANANAROUTER_IMAGE_ASYNC_CONFIG_CONVERGENCE_RELATIVE_PATH = ["packages", "db", "migrations", "20260828-bananarouter-image-async-config-convergence.sql"];
const PROMPT_REVERSE_TOOL_MODEL_RELATIVE_PATH = ["packages", "db", "migrations", "20260829-enable-prompt-reverse-tool-model.sql"];
const MODELFLARE_RESPONSES_MODEL_RELATIVE_PATH = ["packages", "db", "migrations", "20260830-add-modelflare-responses-model.sql"];
const SAN_BAO_MEDIA_MODELS_RELATIVE_PATH = ["packages", "db", "migrations", "20260901-add-san-bao-media-models.sql"];
const SAN_BAO_GPT_IMAGE2_VARIANTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260902-merge-san-bao-gpt-image2-variants.sql"];
const GLOBALAIOPC_MODEL_CENTER_SOUNDCLONE_RELATIVE_PATH = ["packages", "db", "migrations", "20260903-add-globalaiopc-model-center-and-soundclone.sql"];
const PROVIDER_MATERIAL_ASSETS_RELATIVE_PATH = ["packages", "db", "migrations", "20260904-create-provider-material-assets.sql"];
const HOME_RECOMMENDATIONS_RELATIVE_PATH = ["packages", "db", "migrations", "20260905-home-recommendations.sql"];
const HOME_BACKGROUND_VIDEO_RELATIVE_PATH = ["packages", "db", "migrations", "20260906-home-background-video.sql"];
const FREE_GENERATION_WORKSPACES_RELATIVE_PATH = ["packages", "db", "migrations", "20260907-free-generation-workspaces.sql"];
const HIDE_SOUNDCLONE_PROVIDER_PARAMETERS_RELATIVE_PATH = ["packages", "db", "migrations", "20260908-hide-soundclone-provider-parameters.sql"];
const PROJECT_COVER_STORAGE_OBJECT_BACKFILL_RELATIVE_PATH = ["packages", "db", "migrations", "20260909-backfill-project-cover-storage-objects.sql"];
const MARKETING_MODULE_RELATIVE_PATH = ["packages", "db", "migrations", "20260910-create-marketing-module.sql"];
const PROJECT_UPLOAD_STORAGE_OBJECT_INDEX_RELATIVE_PATH = ["packages", "db", "migrations", "20260911-project-upload-storage-object-index.sql"];
const MARKETING_BRAND_PROFILES_RELATIVE_PATH = ["packages", "db", "migrations", "20260912-create-marketing-brand-profiles.sql"];
const MARKETING_EXECUTOR_HEALTH_RELATIVE_PATH = ["packages", "db", "migrations", "20260913-marketing-executor-health.sql"];
const MARKETING_EXECUTOR_ALERTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260914-marketing-executor-alerts.sql"];
const MARKETING_RESEARCH_REQUEST_LOG_RELATIVE_PATH = ["packages", "db", "migrations", "20260915-marketing-research-request-log.sql"];
const MARKETING_AGENT_USAGE_RECORDS_RELATIVE_PATH = ["packages", "db", "migrations", "20260916-marketing-agent-usage-records.sql"];
const MARKETING_TEXT_AGENT_PROVIDER_AUDIT_RELATIVE_PATH = ["packages", "db", "migrations", "20260917-marketing-text-agent-provider-audit.sql"];
const MARKETING_COMPONENT_ADMISSIONS_RELATIVE_PATH = ["packages", "db", "migrations", "20260918-marketing-component-admissions.sql"];
const MARKETING_GENERATION_RUNS_RELATIVE_PATH = ["packages", "db", "migrations", "20260919-marketing-generation-runs.sql"];
const MARKETING_EXECUTION_OWNER_BINDINGS_RELATIVE_PATH = ["packages", "db", "migrations", "20260920-marketing-execution-owner-bindings.sql"];
const MARKETING_GENERATION_CONFIRMATIONS_RELATIVE_PATH = ["packages", "db", "migrations", "20260921-marketing-generation-confirmations.sql"];
const MARKETING_GENERATION_SKILLS_RELATIVE_PATH = ["packages", "db", "migrations", "20260922-marketing-generation-skills.sql"];
const MARKETING_SKILL_KINDS_RELATIVE_PATH = ["packages", "db", "migrations", "20260923-marketing-skill-kinds.sql"];
const EPISODE_COVER_STORAGE_RELATIVE_PATH = ["packages", "db", "migrations", "20260924-add-episode-cover-storage.sql"];
const CANVAS_AGENT_OUTBOX_WAKEUP_RELATIVE_PATH = ["packages", "db", "migrations", "20260831-canvas-agent-outbox-wakeup.sql"];
const PROJECT_COVER_STORAGE_OBJECT_BACKFILL_MIGRATION_NAME = "20260909-backfill-project-cover-storage-objects.sql";
const SMS_SEND_RECORD_SECRET_REDACTION_RELATIVE_PATH = ["packages", "db", "migrations", "20260804-z-redact-sms-send-record-secrets.sql"];
const TASK_CENTER_INCREMENTAL_INDEXES_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-task-center-incremental-indexes.sql"];
const GENERATION_OUTBOX_FAIR_DISPATCH_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-outbox-fair-dispatch.sql"];
const GENERATION_DUE_POLL_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-due-poll.sql"];
const GENERATION_PROVIDER_ROUTE_SNAPSHOTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-provider-route-snapshots.sql"];
const GENERATION_STAGE_SUCCESSORS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-stage-successors.sql"];
const GENERATION_WEBHOOK_INBOX_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-generation-webhook-inbox.sql"];
const CANVAS_GENERATION_SCOPE_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-canvas-generation-scope.sql"];
const STANDALONE_CANVAS_PROJECT_SHELL_CLEANUP_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-cleanup-standalone-canvas-project-shells.sql"];
const PROJECT_SOURCE_DOCUMENTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-create-project-source-documents.sql"];
const DECOUPLE_SCRIPTS_FROM_PROJECTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-decouple-scripts-from-projects.sql"];
const DECOUPLE_CANVASES_FROM_PROJECTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-decouple-canvases-from-projects.sql"];
const GENERATION_TASK_SNAPSHOT_TIMEOUTS_RELATIVE_PATH = ["packages", "db", "migrations", "20260722-zzz-normalize-generation-task-snapshot-timeouts.sql"];
const BANANAROUTER_MODELS_RELATIVE_PATH = ["packages", "db", "migrations", "20260728-add-bananarouter-models.sql"];

export async function loadCurrentSchemaSql(rootDir = process.cwd()) {
  return readFile(join(rootDir, ...CURRENT_SCHEMA_RELATIVE_PATH), "utf8");
}

export async function loadReferenceSeedSql(rootDir = process.cwd()) {
  return readFile(join(rootDir, ...REFERENCE_SEED_RELATIVE_PATH), "utf8");
}

export async function loadSqlMigrations(rootDir = process.cwd(), options = {}) {
  const { fromName = null } = options;
  const migrations = [
    { name: "user-centric-schema.sql", sql: await loadCurrentSchemaSql(rootDir) },
    { name: "model-reference-seed.sql", sql: await loadReferenceSeedSql(rootDir) },
    {
      name: "20260718-create-director-desks.sql",
      sql: await readFile(join(rootDir, ...DIRECTOR_DESK_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260718-create-team-member-director-desks.sql",
      sql: await readFile(join(rootDir, ...TEAM_MEMBER_DIRECTOR_DESK_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-add-aliyun-bailian-audio-model.sql",
      sql: await readFile(join(rootDir, ...ALIYUN_BAILIAN_AUDIO_MODEL_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-correct-cosyvoice-v2-contract.sql",
      sql: await readFile(join(rootDir, ...COSYVOICE_V2_CONTRACT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-enable-project-multi-canvases.sql",
      sql: await readFile(join(rootDir, ...PROJECT_MULTI_CANVAS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-create-creator-agent-assets.sql",
      sql: await readFile(join(rootDir, ...CREATOR_AGENT_ASSETS_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260720-create-creator-brand-kits.sql",
      sql: await readFile(join(rootDir, ...CREATOR_BRAND_KITS_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-align-globalaiopc-video-doc-contract.sql",
      sql: await readFile(join(rootDir, ...GLOBALAIOPC_VIDEO_DOC_CONTRACT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-align-lingdong-api-doc-contract.sql",
      sql: await readFile(join(rootDir, ...LINGDONG_API_DOC_CONTRACT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-align-cumob-image-contract.sql",
      sql: await readFile(join(rootDir, ...CUMOB_IMAGE_CONTRACT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-create-creator-tool-presets.sql",
      sql: await readFile(join(rootDir, ...CREATOR_TOOL_PRESETS_SCHEMA_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-generation-outbox-reliability.sql",
      sql: await readFile(join(rootDir, ...GENERATION_OUTBOX_RELIABILITY_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-unify-generation-timeout-policy.sql",
      sql: await readFile(join(rootDir, ...GENERATION_TIMEOUT_POLICY_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-z-remove-legacy-generation-strategy-overrides.sql",
      sql: await readFile(join(rootDir, ...GENERATION_STRATEGY_OVERRIDE_CLEANUP_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260721-zz-remove-legacy-provider-configs.sql",
      sql: await readFile(join(rootDir, ...LEGACY_PROVIDER_CONFIG_CLEANUP_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-align-cumob-async-polling.sql",
      sql: await readFile(join(rootDir, ...CUMOB_ASYNC_POLLING_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-canvas-generation-scope.sql",
      sql: await readFile(join(rootDir, ...CANVAS_GENERATION_SCOPE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-cleanup-standalone-canvas-project-shells.sql",
      sql: await readFile(join(rootDir, ...STANDALONE_CANVAS_PROJECT_SHELL_CLEANUP_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-create-project-source-documents.sql",
      sql: await readFile(join(rootDir, ...PROJECT_SOURCE_DOCUMENTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-decouple-canvases-from-projects.sql",
      sql: await readFile(join(rootDir, ...DECOUPLE_CANVASES_FROM_PROJECTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-decouple-scripts-from-projects.sql",
      sql: await readFile(join(rootDir, ...DECOUPLE_SCRIPTS_FROM_PROJECTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-due-poll.sql",
      sql: await readFile(join(rootDir, ...GENERATION_DUE_POLL_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-outbox-fair-dispatch.sql",
      sql: await readFile(join(rootDir, ...GENERATION_OUTBOX_FAIR_DISPATCH_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-provider-route-snapshots.sql",
      sql: await readFile(join(rootDir, ...GENERATION_PROVIDER_ROUTE_SNAPSHOTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-queue-elastic-shards.sql",
      sql: await readFile(join(rootDir, ...GENERATION_QUEUE_ELASTIC_SHARDS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-stage-successors.sql",
      sql: await readFile(join(rootDir, ...GENERATION_STAGE_SUCCESSORS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-generation-webhook-inbox.sql",
      sql: await readFile(join(rootDir, ...GENERATION_WEBHOOK_INBOX_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-task-center-incremental-indexes.sql",
      sql: await readFile(join(rootDir, ...TASK_CENTER_INCREMENTAL_INDEXES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260722-zzz-normalize-generation-task-snapshot-timeouts.sql",
      sql: await readFile(join(rootDir, ...GENERATION_TASK_SNAPSHOT_TIMEOUTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260723-correct-generation-queue-lifecycle.sql",
      sql: await readFile(join(rootDir, ...GENERATION_QUEUE_LIFECYCLE_CORRECTION_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260724-durable-generation-queue-assignment-lifecycle.sql",
      sql: await readFile(join(rootDir, ...GENERATION_QUEUE_DURABLE_LIFECYCLE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260725-create-canvas-agent-runtime.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_RUNTIME_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260725-generation-queue-worker-leases.sql",
      sql: await readFile(join(rootDir, ...GENERATION_QUEUE_WORKER_LEASES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260725-z-generation-queue-admin-commands.sql",
      sql: await readFile(join(rootDir, ...GENERATION_QUEUE_ADMIN_COMMANDS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260726-generation-queue-job-cancellations.sql",
      sql: await readFile(join(rootDir, ...GENERATION_QUEUE_JOB_CANCELLATIONS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260727-generation-queue-publish-cancellation-fencing.sql",
      sql: await readFile(join(rootDir, ...GENERATION_QUEUE_PUBLISH_CANCELLATION_FENCING_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260727-generation-queue-worker-lease-db-clock.sql",
      sql: await readFile(join(rootDir, ...GENERATION_QUEUE_WORKER_LEASE_DB_CLOCK_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260728-canvas-actor-principals.sql",
      sql: await readFile(join(rootDir, ...CANVAS_ACTOR_PRINCIPALS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260728-comfyui-workflow-library.sql",
      sql: await readFile(join(rootDir, ...COMFYUI_WORKFLOW_LIBRARY_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260728-z-remove-legacy-workflow-runtime.sql",
      sql: await readFile(join(rootDir, ...LEGACY_WORKFLOW_RUNTIME_CLEANUP_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260728-add-bananarouter-models.sql",
      sql: await readFile(join(rootDir, ...BANANAROUTER_MODELS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260729-canvas-generation-runtime.sql",
      sql: await readFile(join(rootDir, ...CANVAS_GENERATION_RUNTIME_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260729-canvas-user-config-library.sql",
      sql: await readFile(join(rootDir, ...CANVAS_USER_CONFIG_LIBRARY_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260729-create-prompt-marketplace.sql",
      sql: await readFile(join(rootDir, ...PROMPT_MARKETPLACE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260730-canvas-media-derivations.sql",
      sql: await readFile(join(rootDir, ...CANVAS_MEDIA_DERIVATIONS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260730-z-unify-prompt-storage.sql",
      sql: await readFile(join(rootDir, ...UNIFIED_PROMPT_STORAGE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260730-zz-prompt-cover-storage.sql",
      sql: await readFile(join(rootDir, ...PROMPT_COVER_STORAGE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260731-canvas-generation-batch-billing.sql",
      sql: await readFile(join(rootDir, ...CANVAS_GENERATION_BATCH_BILLING_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260731-failed-image-submission-active-repair-index.sql",
      sql: await readFile(join(rootDir, ...FAILED_IMAGE_SUBMISSION_ACTIVE_REPAIR_INDEX_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260731-failed-image-submission-snapshot-repair-index.sql",
      sql: await readFile(join(rootDir, ...FAILED_IMAGE_SUBMISSION_SNAPSHOT_REPAIR_INDEX_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260731-z-canvas-agent-model-compatibility-probes.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_MODEL_PROBES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260801-z-create-prompt-ratings.sql",
      sql: await readFile(join(rootDir, ...PROMPT_RATINGS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260801-zz-store-prompt-rating-score.sql",
      sql: await readFile(join(rootDir, ...PROMPT_RATING_SCORE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260802-canvas-settings.sql",
      sql: await readFile(join(rootDir, ...CANVAS_SETTINGS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260803-canvas-agent-conversation-pins.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_CONVERSATION_PINS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260804-canvas-prompt-directive-configs.sql",
      sql: await readFile(join(rootDir, ...CANVAS_PROMPT_DIRECTIVE_CONFIGS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260804-z-redact-sms-send-record-secrets.sql",
      sql: await readFile(join(rootDir, ...SMS_SEND_RECORD_SECRET_REDACTION_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260805-canvas-agent-conversation-locks.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_CONVERSATION_LOCKS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260806-backfill-prompt-summaries.sql",
      sql: await readFile(join(rootDir, ...PROMPT_SUMMARY_BACKFILL_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260807-canvas-agent-provider-config-drafts.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_PROVIDER_CONFIG_DRAFTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260808-canvas-agent-media-prompt-preferences.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_MEDIA_PROMPT_PREFERENCES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260809-canvas-character-library.sql",
      sql: await readFile(join(rootDir, ...CANVAS_CHARACTER_LIBRARY_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260809-z-enable-canvas-agent-text-model.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_TEXT_MODEL_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260809-zz-canvas-agent-structured-json-fallback.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_STRUCTURED_JSON_FALLBACK_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260810-canvas-agent-knowledge-boundary-tables.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_KNOWLEDGE_BOUNDARY_TABLES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260810-z-canvas-agent-step-input-json.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_STEP_INPUT_JSON_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260811-prompt-skill-defaults.sql",
      sql: await readFile(join(rootDir, ...PROMPT_SKILL_DEFAULTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260812-canvas-agent-step-skip.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_STEP_SKIP_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260812-expand-prompt-skill-default-categories.sql",
      sql: await readFile(join(rootDir, ...EXPANDED_PROMPT_SKILL_DEFAULTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260813-seed-other-prompt-default.sql",
      sql: await readFile(join(rootDir, ...OTHER_PROMPT_DEFAULT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260814-require-project-style.sql",
      sql: await readFile(join(rootDir, ...REQUIRED_PROJECT_STYLE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260815-canvas-generation-batch-text.sql",
      sql: await readFile(join(rootDir, ...CANVAS_GENERATION_BATCH_TEXT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260816-canvas-style-reference-enabled.sql",
      sql: await readFile(join(rootDir, ...CANVAS_STYLE_REFERENCE_ENABLED_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260817-team-assets-storage-object.sql",
      sql: await readFile(join(rootDir, ...TEAM_ASSETS_STORAGE_OBJECT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260818-team-assets-tags.sql",
      sql: await readFile(join(rootDir, ...TEAM_ASSETS_TAGS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260819-team-assets-folders.sql",
      sql: await readFile(join(rootDir, ...TEAM_ASSETS_FOLDERS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260820-add-cumob-text-models.sql",
      sql: await readFile(join(rootDir, ...CUMOB_TEXT_MODELS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260821-append-script-output-rules.sql",
      sql: await readFile(join(rootDir, ...SCRIPT_OUTPUT_RULES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260822-canvas-agent-worker-indexes.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_WORKER_INDEXES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260823-canvas-agent-queue-shards.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_QUEUE_SHARDS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260824-task-center-provider-diagnostics.sql",
      sql: await readFile(join(rootDir, ...TASK_CENTER_PROVIDER_DIAGNOSTICS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260824-z-task-center-provider-diagnostics-index.sql",
      sql: await readFile(join(rootDir, ...TASK_CENTER_PROVIDER_DIAGNOSTICS_INDEX_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260825-bananarouter-image-async-recovery.sql",
      sql: await readFile(join(rootDir, ...BANANAROUTER_IMAGE_ASYNC_RECOVERY_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260826-converge-provider-protocol-constraint.sql",
      sql: await readFile(join(rootDir, ...PROVIDER_PROTOCOL_CONVERGENCE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260827-converge-canvas-agent-shard-constraint.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_SHARD_CONSTRAINT_CONVERGENCE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260828-bananarouter-image-async-config-convergence.sql",
      sql: await readFile(join(rootDir, ...BANANAROUTER_IMAGE_ASYNC_CONFIG_CONVERGENCE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260829-enable-prompt-reverse-tool-model.sql",
      sql: await readFile(join(rootDir, ...PROMPT_REVERSE_TOOL_MODEL_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260830-add-modelflare-responses-model.sql",
      sql: await readFile(join(rootDir, ...MODELFLARE_RESPONSES_MODEL_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260831-canvas-agent-outbox-wakeup.sql",
      sql: await readFile(join(rootDir, ...CANVAS_AGENT_OUTBOX_WAKEUP_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260901-add-san-bao-media-models.sql",
      sql: await readFile(join(rootDir, ...SAN_BAO_MEDIA_MODELS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260902-merge-san-bao-gpt-image2-variants.sql",
      sql: await readFile(join(rootDir, ...SAN_BAO_GPT_IMAGE2_VARIANTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260903-add-globalaiopc-model-center-and-soundclone.sql",
      sql: await readFile(join(rootDir, ...GLOBALAIOPC_MODEL_CENTER_SOUNDCLONE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260904-create-provider-material-assets.sql",
      sql: await readFile(join(rootDir, ...PROVIDER_MATERIAL_ASSETS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260905-home-recommendations.sql",
      sql: await readFile(join(rootDir, ...HOME_RECOMMENDATIONS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260906-home-background-video.sql",
      sql: await readFile(join(rootDir, ...HOME_BACKGROUND_VIDEO_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260907-free-generation-workspaces.sql",
      sql: await readFile(join(rootDir, ...FREE_GENERATION_WORKSPACES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260908-hide-soundclone-provider-parameters.sql",
      sql: await readFile(join(rootDir, ...HIDE_SOUNDCLONE_PROVIDER_PARAMETERS_RELATIVE_PATH), "utf8"),
    },
    {
      name: PROJECT_COVER_STORAGE_OBJECT_BACKFILL_MIGRATION_NAME,
      sql: await readFile(join(rootDir, ...PROJECT_COVER_STORAGE_OBJECT_BACKFILL_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260910-create-marketing-module.sql",
      sql: await readFile(join(rootDir, ...MARKETING_MODULE_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260911-project-upload-storage-object-index.sql",
      sql: await readFile(join(rootDir, ...PROJECT_UPLOAD_STORAGE_OBJECT_INDEX_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260912-create-marketing-brand-profiles.sql",
      sql: await readFile(join(rootDir, ...MARKETING_BRAND_PROFILES_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260913-marketing-executor-health.sql",
      sql: await readFile(join(rootDir, ...MARKETING_EXECUTOR_HEALTH_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260914-marketing-executor-alerts.sql",
      sql: await readFile(join(rootDir, ...MARKETING_EXECUTOR_ALERTS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260915-marketing-research-request-log.sql",
      sql: await readFile(join(rootDir, ...MARKETING_RESEARCH_REQUEST_LOG_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260916-marketing-agent-usage-records.sql",
      sql: await readFile(join(rootDir, ...MARKETING_AGENT_USAGE_RECORDS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260917-marketing-text-agent-provider-audit.sql",
      sql: await readFile(join(rootDir, ...MARKETING_TEXT_AGENT_PROVIDER_AUDIT_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260918-marketing-component-admissions.sql",
      sql: await readFile(join(rootDir, ...MARKETING_COMPONENT_ADMISSIONS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260919-marketing-generation-runs.sql",
      sql: await readFile(join(rootDir, ...MARKETING_GENERATION_RUNS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260920-marketing-execution-owner-bindings.sql",
      sql: await readFile(join(rootDir, ...MARKETING_EXECUTION_OWNER_BINDINGS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260921-marketing-generation-confirmations.sql",
      sql: await readFile(join(rootDir, ...MARKETING_GENERATION_CONFIRMATIONS_RELATIVE_PATH), "utf8"),
    },
      {
        name: "20260922-marketing-generation-skills.sql",
        sql: await readFile(join(rootDir, ...MARKETING_GENERATION_SKILLS_RELATIVE_PATH), "utf8"),
      },
    {
      name: "20260923-marketing-skill-kinds.sql",
      sql: await readFile(join(rootDir, ...MARKETING_SKILL_KINDS_RELATIVE_PATH), "utf8"),
    },
    {
      name: "20260924-add-episode-cover-storage.sql",
      sql: await readFile(join(rootDir, ...EPISODE_COVER_STORAGE_RELATIVE_PATH), "utf8"),
    },
  ];
  return fromName
    ? migrations.filter((migration) => migration.name.localeCompare(fromName) >= 0)
    : migrations;
}

export async function applySqlMigrations(db: SqlDatabase, rootDir = process.cwd(), options = {}) {
  const migrations = await loadSqlMigrations(rootDir, options);
  for (const migration of migrations) {
    await executeMigration(db, migration.sql, migration.name);
  }
}

export async function applySqlMigration(
  db: SqlDatabase,
  rootDir = process.cwd(),
  migrationName: string,
) {
  const migrations = await loadSqlMigrations(rootDir);
  const migration = migrations.find((candidate) => candidate.name === migrationName);
  if (!migration) {
    throw new Error(`unknown_current_schema_migration:${migrationName}`);
  }
  const sql = migration.sql;
  await executeMigration(db, sql, migration.name);
}

async function executeMigration(db: SqlDatabase, migration: string, migrationName: string) {
  const concurrentIndexName = CONCURRENT_MIGRATION_INDEX_NAMES.get(migrationName);
  if (concurrentIndexName) {
    await removeInvalidConcurrentIndex(db, concurrentIndexName);
  }
  const exec = (db as { exec?: (sql: string) => Promise<unknown> }).exec;
  if (typeof exec === "function") {
    await exec.call(db, migration);
  } else {
    await db.query(migration);
  }
  if (migrationName === TASK_CENTER_PROVIDER_DIAGNOSTICS_MIGRATION_NAME) {
    await backfillTaskCenterProviderDiagnostics(db);
  }
  if (migrationName === PROJECT_COVER_STORAGE_OBJECT_BACKFILL_MIGRATION_NAME) {
    await backfillProjectCoverStorageObjects(db);
  }
  if (concurrentIndexName) {
    await assertConcurrentIndexValid(db, concurrentIndexName);
  }
}

async function backfillTaskCenterProviderDiagnostics(db: SqlDatabase) {
  for (const functionName of [
    "backfill_provider_request_task_center_diagnostics_batch",
    "backfill_generation_snapshot_task_center_diagnostics_batch",
  ]) {
    let cursor: string | null = null;
    while (true) {
      const result = await db.query<{ processed_count: number | string; next_id: string | null }>(
        `SELECT processed_count, next_id FROM ${functionName}($1::uuid, 250)`,
        [cursor],
      );
      const processedCount = Number(result.rows[0]?.processed_count ?? 0);
      cursor = result.rows[0]?.next_id ?? null;
      if (processedCount === 0 || !cursor) break;
    }
  }
}

async function backfillProjectCoverStorageObjects(db: SqlDatabase) {
  const legacyCovers = await db.query<{ id: string; cover_image_url: string }>(`
    SELECT id, cover_image_url
    FROM projects
    WHERE cover_storage_object_id IS NULL
      AND cover_image_url IS NOT NULL
  `);

  for (const project of legacyCovers.rows) {
    const parsed = parseLegacyCosObjectUrl(project.cover_image_url);
    if (!parsed) continue;
    await db.query(
      `
        UPDATE projects AS project
        SET cover_storage_object_id = object.id
        FROM storage_objects AS object
        WHERE project.id = $1
          AND project.cover_storage_object_id IS NULL
          AND object.project_id = project.id
          AND object.bucket = $2
          AND object.object_key = $3
          AND object.status = 'available'
          AND object.deleted_at IS NULL
      `,
      [project.id, parsed.bucket, parsed.objectKey],
    );
  }
}

function parseLegacyCosObjectUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const hostMatch = url.hostname.match(/^(.+)\.cos\.[^.]+\.myqcloud\.com$/i);
    if (!hostMatch?.[1] || !url.pathname || url.pathname === "/") return null;
    return {
      bucket: hostMatch[1],
      objectKey: decodeURIComponent(url.pathname.slice(1)),
    };
  } catch {
    return null;
  }
}

async function removeInvalidConcurrentIndex(db: SqlDatabase, indexName: string) {
  const result = await db.query<{ is_valid: boolean }>(
    `
      SELECT index_record.indisvalid AS is_valid
      FROM pg_index index_record
      JOIN pg_class relation ON relation.oid = index_record.indexrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND relation.relname = $1
    `,
    [indexName],
  );
  if (result.rows[0]?.is_valid === false) {
    await db.query(`DROP INDEX CONCURRENTLY IF EXISTS ${quoteIdentifier(indexName)}`);
  }
}

async function assertConcurrentIndexValid(db: SqlDatabase, indexName: string) {
  const result = await db.query<{ is_valid: boolean }>(
    `
      SELECT index_record.indisvalid AS is_valid
      FROM pg_index index_record
      JOIN pg_class relation ON relation.oid = index_record.indexrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = current_schema()
        AND relation.relname = $1
    `,
    [indexName],
  );
  if (result.rows[0]?.is_valid !== true) {
    throw new Error(`concurrent_index_invalid:${indexName}`);
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

import { createHash } from "node:crypto";

import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import type { CanvasActorScope } from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  listCanvasUserConfigs,
  listCanvasUserConfigVersions,
  resolveCanvasUserConfigSnapshot,
  type CanvasUserConfigType,
} from "./canvas-user-config.service.ts";

const REFERENCE_ID = "[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?";
const REFERENCE_TOKEN = new RegExp(`@([a-z][a-z0-9_-]*):(${REFERENCE_ID})(?:@(${REFERENCE_ID}))?`, "g");
const REFERENCE_ID_PATTERN = new RegExp(`^${REFERENCE_ID}$`);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUPPORTED_TYPES = new Set(["node", "asset", "model", "voice", "drama", "style", "skill", "prompt"]);
const MAX_REFERENCE_COUNT = 50;
const MAX_PROMPT_BYTES = 100_000;

export const CANVAS_PROMPT_EXPANSION_ORDER = [
  "slash_command",
  "preset",
  "skill",
  "style",
  "reference",
  "suffix",
] as const;

export interface CanvasPromptExpansionDirectiveContract {
  schemaVersion: 1;
  slashCommands: Array<{ id: string; version: string }>;
  presets: Array<{ id: string; version: string }>;
  suffixes: Array<{ id: string; version: string }>;
}

export type CanvasPromptDirectiveStage = "slash_command" | "preset" | "suffix";

export interface CanvasPromptDirectiveCatalogRecord {
  id: string;
  version: string;
  content: string;
  contentHash: string;
  status?: "active" | "disabled" | "archived";
  accessible?: boolean;
}

export interface CanvasPromptDirectiveCatalog {
  slashCommands?: CanvasPromptDirectiveCatalogRecord[];
  presets?: CanvasPromptDirectiveCatalogRecord[];
  suffixes?: CanvasPromptDirectiveCatalogRecord[];
}

/** Load directive bodies from immutable owner-scoped config versions. */
export async function loadCanvasPromptDirectiveCatalog(
  db: SqlDatabase,
  input: { actorScope: CanvasActorScope; limit?: number },
): Promise<CanvasPromptDirectiveCatalog> {
  const limit = Math.min(200, Math.max(1, Math.trunc(Number(input.limit ?? 100)) || 100));
  const catalog: CanvasPromptDirectiveCatalog = { slashCommands: [], presets: [] };
  for (const type of ["slash_command", "preset"] as const) {
    const configs = await listCanvasUserConfigs(db, {
      userId: input.actorScope.ownerUserId,
      type,
      includeArchived: false,
      limit,
    });
    for (const config of configs) {
      if (!config.currentVersionId) continue;
      const snapshot = await resolveCanvasUserConfigSnapshot(db, {
        userId: input.actorScope.ownerUserId,
        configId: config.id,
        versionId: config.currentVersionId,
        expectedType: type,
      });
      const manifest = snapshot.manifest as Record<string, unknown>;
      const content = readString(manifest.content)
        || readString(manifest.prompt)
        || readString(manifest.text)
        || readString(manifest.value);
      if (!content) continue;
      const record: CanvasPromptDirectiveCatalogRecord = {
        id: config.id,
        version: String(snapshot.version),
        content,
        contentHash: snapshot.contentHash,
        status: "active",
        accessible: true,
      };
      if (type === "slash_command") catalog.slashCommands!.push(record);
      else catalog.presets!.push(record);
    }
  }
  return catalog;
}

export interface CanvasPromptDirectiveSnapshot {
  stage: CanvasPromptDirectiveStage;
  id: string;
  version: string;
  contentHash: string;
}

export interface CanvasPromptModelExecutionBinding {
  kind: "model";
  modelConfigId: string;
  modelCode: string;
  modelConfigRevisionId: string;
  contentHash: string;
}

export interface CanvasPromptVoiceExecutionBinding {
  kind: "voice";
  voiceAssetId: string;
  versionHash: string;
  contentHash: string;
}

export interface CanvasPromptDramaExecutionBinding {
  kind: "drama";
  characterId: string;
  selector: string;
  contentHash: string;
  references: Array<{
    referenceId: string;
    storageObjectId: string | null;
    assetVersionId: string | null;
  }>;
}

export function applyCanvasPromptDramaBindings(
  parameters: Record<string, unknown>,
  bindings: CanvasPromptDramaExecutionBinding[],
) {
  const references = bindings.flatMap((binding) => binding.references);
  if (!references.length) return parameters;
  const referenceAssetVersionIds = Array.from(new Set([
    ...stringList(parameters.referenceAssetVersionIds),
    ...references.map((item) => item.assetVersionId).filter((item): item is string => Boolean(item)),
  ]));
  const storageReferences = [...new Map(references
    .filter((item) => !item.assetVersionId && item.storageObjectId)
    .map((item) => [item.storageObjectId!, {
      storageObjectId: item.storageObjectId,
      url: `/api/storage/objects/${encodeURIComponent(item.storageObjectId!)}/content`,
    }])).values()];
  return {
    ...parameters,
    ...(referenceAssetVersionIds.length ? { referenceAssetVersionIds } : {}),
    ...(storageReferences.length
      ? { referenceImages: [...arrayList(parameters.referenceImages), ...storageReferences] }
      : {}),
  };
}

export interface CanvasPromptNodeReadDependency {
  kind: "canvas_node_read";
  nodeKey: string;
  documentVersionId: string;
  serverRevision: number;
  contentHash: string;
  mode: "latest" | "snapshot";
}

export interface CanvasPromptReferenceSnapshot {
  token: string;
  type: "node" | "asset" | "model" | "voice" | "drama" | "style" | "skill" | "prompt";
  id: string;
  requestedVersion: string | null;
  resolvedVersionId: string;
  resolvedVersion: number | string;
  contentHash: string;
}

export interface ResolvedCanvasPrompt {
  sourcePrompt: string;
  expandedPrompt: string;
  references: CanvasPromptReferenceSnapshot[];
  expansionOrder: typeof CANVAS_PROMPT_EXPANSION_ORDER;
  directives: CanvasPromptDirectiveSnapshot[];
  executionBindings: {
    model: CanvasPromptModelExecutionBinding | null;
    voice: CanvasPromptVoiceExecutionBinding | null;
    drama: CanvasPromptDramaExecutionBinding[];
  };
  readDependencies: CanvasPromptNodeReadDependency[];
}

export class CanvasPromptReferenceError extends Error {
  constructor(
    readonly code: string,
    readonly reference?: { token: string; type: string; id: string; version: string | null; path?: string[] },
  ) {
    super(code);
    this.name = "CanvasPromptReferenceError";
  }
}

export async function resolveCanvasPromptReferences(
  db: SqlDatabase,
  input: { actorScope: CanvasActorScope; sourcePrompt: string },
): Promise<ResolvedCanvasPrompt> {
  assertRunScope(input.actorScope);
  const sourcePrompt = String(input.sourcePrompt ?? "");
  if (Buffer.byteLength(sourcePrompt, "utf8") > MAX_PROMPT_BYTES) {
    throw new CanvasPromptReferenceError("canvas_prompt_too_large");
  }
  const references: CanvasPromptReferenceSnapshot[] = [];
  const state: ReferenceExpansionState = {
    referenceCount: 0,
    modelBindings: [],
    voiceBindings: [],
    dramaBindings: [],
    readDependencies: [],
  };
  const expandedPrompt = await expandReferenceText(db, input.actorScope, sourcePrompt, references, state, []);
  if (Buffer.byteLength(expandedPrompt, "utf8") > MAX_PROMPT_BYTES) {
    throw new CanvasPromptReferenceError("canvas_prompt_expanded_too_large");
  }
  return {
    sourcePrompt,
    expandedPrompt,
    references,
    expansionOrder: CANVAS_PROMPT_EXPANSION_ORDER,
    directives: [],
    executionBindings: resolveExecutionBindings(state),
    readDependencies: uniqueReadDependencies(state.readDependencies),
  };
}

export function validateCanvasPromptExpansionDirectiveContract(
  value: unknown,
): CanvasPromptExpansionDirectiveContract {
  const record = parseRecord(value);
  if (record.schemaVersion !== 1) {
    throw new CanvasPromptReferenceError("canvas_prompt_expansion_contract_invalid");
  }
  return {
    schemaVersion: 1,
    slashCommands: validateDirectiveList(record.slashCommands),
    presets: validateDirectiveList(record.presets),
    suffixes: validateDirectiveList(record.suffixes),
  };
}

export function normalizeCanvasPromptExpansionDirectives(value: unknown) {
  return validateCanvasPromptExpansionDirectiveContract(value);
}

/** Catalog entries must come from server-owned version records, never from request content. */
export function expandCanvasPromptDirectives(input: {
  sourcePrompt: string;
  directives: unknown;
  catalog: CanvasPromptDirectiveCatalog;
}) {
  const sourcePrompt = String(input.sourcePrompt ?? "");
  if (Buffer.byteLength(sourcePrompt, "utf8") > MAX_PROMPT_BYTES) {
    throw new CanvasPromptReferenceError("canvas_prompt_too_large");
  }
  const directives = normalizeCanvasPromptExpansionDirectives(input.directives);
  const slashCommands = resolveDirectiveStage("slash_command", directives.slashCommands, input.catalog.slashCommands);
  const presets = resolveDirectiveStage("preset", directives.presets, input.catalog.presets);
  const suffixes = resolveDirectiveStage("suffix", directives.suffixes, input.catalog.suffixes);
  const promptWithPrefixes = joinPromptParts([
    ...slashCommands.map((item) => item.content),
    ...presets.map((item) => item.content),
    sourcePrompt,
  ]);
  const suffixText = joinPromptParts(suffixes.map((item) => item.content));
  if (Buffer.byteLength(joinPromptParts([promptWithPrefixes, suffixText]), "utf8") > MAX_PROMPT_BYTES) {
    throw new CanvasPromptReferenceError("canvas_prompt_expanded_too_large");
  }
  return {
    sourcePrompt,
    promptWithPrefixes,
    suffixText,
    snapshots: [...slashCommands, ...presets, ...suffixes].map(({ stage, id, version, contentHash }) => ({
      stage, id, version, contentHash,
    })),
  };
}

export async function resolveCanvasPromptWithDirectives(
  db: SqlDatabase,
  input: {
    actorScope: CanvasActorScope;
    sourcePrompt: string;
    directives: unknown;
    directiveCatalog: CanvasPromptDirectiveCatalog;
  },
): Promise<ResolvedCanvasPrompt> {
  const directiveExpansion = expandCanvasPromptDirectives({
    sourcePrompt: input.sourcePrompt,
    directives: input.directives,
    catalog: input.directiveCatalog,
  });
  const resolved = await resolveCanvasPromptReferences(db, {
    actorScope: input.actorScope,
    sourcePrompt: directiveExpansion.promptWithPrefixes,
  });
  const expandedPrompt = joinPromptParts([resolved.expandedPrompt, directiveExpansion.suffixText]);
  if (Buffer.byteLength(expandedPrompt, "utf8") > MAX_PROMPT_BYTES) {
    throw new CanvasPromptReferenceError("canvas_prompt_expanded_too_large");
  }
  return {
    ...resolved,
    sourcePrompt: directiveExpansion.sourcePrompt,
    expandedPrompt,
    directives: directiveExpansion.snapshots,
  };
}

interface ReferenceExpansionState {
  referenceCount: number;
  modelBindings: CanvasPromptModelExecutionBinding[];
  voiceBindings: CanvasPromptVoiceExecutionBinding[];
  dramaBindings: CanvasPromptDramaExecutionBinding[];
  readDependencies: CanvasPromptNodeReadDependency[];
}

interface ResolvedReferenceValue {
  value: string;
  snapshot: CanvasPromptReferenceSnapshot;
  executionBinding?: CanvasPromptModelExecutionBinding | CanvasPromptVoiceExecutionBinding | CanvasPromptDramaExecutionBinding;
  readDependency?: CanvasPromptNodeReadDependency;
}

async function expandReferenceText(
  db: SqlDatabase,
  scope: CanvasActorScope,
  source: string,
  snapshots: CanvasPromptReferenceSnapshot[],
  state: ReferenceExpansionState,
  ancestry: string[],
): Promise<string> {
  const matches = [...source.matchAll(REFERENCE_TOKEN)];
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const match of matches) {
    state.referenceCount += 1;
    if (state.referenceCount > MAX_REFERENCE_COUNT) {
      throw new CanvasPromptReferenceError("canvas_prompt_reference_limit_exceeded");
    }
    const token = match[0];
    const type = String(match[1] ?? "").toLowerCase();
    const id = String(match[2] ?? "");
    const version = match[3] ? String(match[3]) : null;
    const reference = { token, type, id, version };
    if (!SUPPORTED_TYPES.has(type)) {
      throw new CanvasPromptReferenceError("canvas_prompt_reference_type_unsupported", reference);
    }
    const cycleKey = `${type}:${id}@${version ?? "current"}`;
    if (ancestry.includes(cycleKey)) {
      throw new CanvasPromptReferenceError("canvas_prompt_reference_cycle", {
        ...reference,
        path: [...ancestry, cycleKey],
      });
    }
    const resolved = await resolveReference(db, scope, reference as {
      token: string; type: CanvasPromptReferenceSnapshot["type"]; id: string; version: string | null;
    });
    snapshots.push(resolved.snapshot);
    if (resolved.executionBinding?.kind === "model") state.modelBindings.push(resolved.executionBinding);
    if (resolved.executionBinding?.kind === "voice") state.voiceBindings.push(resolved.executionBinding);
    if (resolved.executionBinding?.kind === "drama") state.dramaBindings.push(resolved.executionBinding);
    if (resolved.readDependency) state.readDependencies.push(resolved.readDependency);
    const value = await expandReferenceText(
      db,
      scope,
      resolved.value,
      snapshots,
      state,
      [...ancestry, cycleKey],
    );
    replacements.push({ start: match.index!, end: match.index! + token.length, value });
  }
  let expanded = source;
  for (const replacement of replacements.reverse()) {
    expanded = `${expanded.slice(0, replacement.start)}${replacement.value}${expanded.slice(replacement.end)}`;
  }
  return expanded;
}

async function resolveReference(
  db: SqlDatabase,
  scope: CanvasActorScope,
  reference: { token: string; type: CanvasPromptReferenceSnapshot["type"]; id: string; version: string | null },
): Promise<ResolvedReferenceValue> {
  if (reference.type === "node") return resolveNodeReference(db, scope, reference);
  if (!UUID_PATTERN.test(reference.id)) throw unavailable(reference);
  if (reference.type === "model") return resolveModelReference(db, reference);
  if (reference.type === "drama") {
    const character = await resolveCanvasCharacterReference(db, scope, reference);
    if (character) return character;
    return resolveTeamAssetReference(db, scope, reference);
  }
  if (reference.type === "voice") {
    return resolveTeamAssetReference(db, scope, reference);
  }
  if (reference.type === "style" || reference.type === "skill") {
    return resolveConfigReference(db, scope, reference, reference.type);
  }
  if (reference.type === "prompt") return resolvePromptReference(db, scope, reference);
  return resolveAssetReference(db, scope, reference);
}

async function resolveConfigReference(
  db: SqlDatabase,
  scope: CanvasActorScope,
  reference: { token: string; type: "style" | "skill"; id: string; version: string | null },
  expectedType: CanvasUserConfigType,
) {
  let versionId: string | null = null;
  if (reference.version) {
    const versions = await listCanvasUserConfigVersions(db, {
      userId: scope.ownerUserId,
      configId: reference.id,
      limit: 200,
    });
    versionId = versions.find((item) => item.id === reference.version || String(item.version) === reference.version)?.id ?? null;
    if (!versionId) throw unavailable(reference);
  }
  try {
    const snapshot = await resolveCanvasUserConfigSnapshot(db, {
      userId: scope.ownerUserId,
      configId: reference.id,
      versionId,
      expectedType,
    });
    const value = reference.type === "style"
      ? readString(snapshot.manifest.prompt)
      : readString(snapshot.manifest.instructions);
    if (!value) throw new CanvasPromptReferenceError("canvas_prompt_reference_value_missing", reference);
    return {
      value,
      snapshot: snapshotRecord(reference, snapshot.versionId, snapshot.version, snapshot.contentHash),
    };
  } catch (error) {
    if (error instanceof CanvasPromptReferenceError) throw error;
    throw unavailable(reference);
  }
}

async function resolvePromptReference(
  db: SqlDatabase,
  scope: CanvasActorScope,
  reference: { token: string; type: "prompt"; id: string; version: string | null },
) {
  const row = await queryOne<{
    id: string; prompt_content: string; updated_at: Date | string;
  }>(db, `
    SELECT prompt.id,prompt.prompt_content,prompt.updated_at
    FROM prompts prompt
    JOIN prompt_user_links link
      ON link.prompt_id=prompt.id AND link.user_id=$2 AND link.status='active'
    WHERE prompt.id=$1 AND prompt.deleted_at IS NULL AND prompt.status='enabled'
      AND ($3::text IS NULL OR $3::text = prompt.id::text)
    LIMIT 1
  `, [reference.id, scope.ownerUserId, reference.version]);
  if (!row) throw unavailable(reference);
  const content = readString(row.prompt_content);
  if (!content) throw new CanvasPromptReferenceError("canvas_prompt_reference_value_missing", reference);
  return {
    value: content,
    snapshot: snapshotRecord(
      reference,
      row.id,
      new Date(row.updated_at).toISOString(),
      hash(content),
    ),
  };
}

async function resolveAssetReference(
  db: SqlDatabase,
  scope: CanvasActorScope,
  reference: { token: string; type: "asset"; id: string; version: string | null },
) {
  const row = await queryOne<{
    asset_id: string; asset_key: string; version_id: string; version_number: number;
    metadata_json: Record<string, unknown> | string; storage_object_id: string | null; storage_status: string | null;
  }>(db, `
    SELECT asset.id AS asset_id,asset.asset_key,version.id AS version_id,version.version_number,
           version.metadata_json,version.storage_object_id,storage.status AS storage_status
    FROM assets asset
    JOIN asset_versions version ON version.asset_id=asset.id
    LEFT JOIN projects project ON project.id=asset.project_id
    LEFT JOIN storage_objects storage ON storage.id=version.storage_object_id
    WHERE (asset.id=$1 OR version.id=$1)
      AND (asset.canvas_project_id=$2 OR project.owner_user_id=$3)
      AND ($4::text IS NULL OR version.id::text=$4 OR version.version_number::text=$4)
      AND (version.storage_object_id IS NULL OR storage.status='available')
    ORDER BY version.version_number DESC
    LIMIT 1
  `, [reference.id, scope.canvasId, scope.ownerUserId, reference.version]);
  if (!row) throw unavailable(reference);
  const metadata = parseRecord(row.metadata_json);
  const value = readString(metadata.prompt)
    || readString(metadata.description)
    || readString(metadata.label)
    || readString(metadata.name)
    || `[asset: ${row.asset_key}]`;
  return {
    value,
    snapshot: snapshotRecord(reference, row.version_id, Number(row.version_number), hash(JSON.stringify({
      assetId: row.asset_id,
      versionId: row.version_id,
      storageObjectId: row.storage_object_id,
      metadata,
    }))),
  };
}

async function resolveNodeReference(
  db: SqlDatabase,
  scope: CanvasActorScope,
  reference: { token: string; type: "node"; id: string; version: string | null },
) {
  const activeNode = await queryOne<{ node_key: string }>(db, `
    SELECT node_key FROM creator_canvas_nodes
    WHERE canvas_project_id=$1 AND node_key=$2 AND deleted_at IS NULL
    LIMIT 1
  `, [scope.canvasId, reference.id]);
  if (!activeNode) throw unavailable(reference);
  const row = reference.version
    ? await queryOne<{ id: string; server_revision: number; document_json: unknown }>(db, `
        SELECT id,server_revision,document_json
        FROM creator_canvas_revisions
        WHERE canvas_project_id=$1 AND (id::text=$2 OR server_revision::text=$2)
        ORDER BY server_revision DESC LIMIT 1
      `, [scope.canvasId, reference.version])
    : await queryOne<{ id: string; server_revision: number; document_json: unknown }>(db, `
        SELECT document.id,document.server_revision,document.document_json
        FROM creator_canvas_projects canvas
        JOIN creator_canvas_documents document ON document.id=canvas.latest_document_id
         WHERE canvas.id=$1 AND canvas.deleted_at IS NULL
        LIMIT 1
      `, [scope.canvasId]);
  if (!row) throw unavailable(reference);
  const document = parseRecord(row.document_json);
  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const node = nodes.find((item) => parseRecord(item).id === reference.id);
  if (!node) throw unavailable(reference);
  const nodeRecord = parseRecord(node);
  const value = readNodeReferenceValue(nodeRecord);
  if (!value) throw new CanvasPromptReferenceError("canvas_prompt_reference_value_missing", reference);
  return {
    value,
    snapshot: snapshotRecord(reference, row.id, Number(row.server_revision), hash(stableJson(nodeRecord))),
    readDependency: {
      kind: "canvas_node_read" as const,
      nodeKey: reference.id,
      documentVersionId: row.id,
      serverRevision: Number(row.server_revision),
      contentHash: hash(stableJson(nodeRecord)),
      mode: reference.version ? "snapshot" : "latest",
    },
  };
}

async function resolveModelReference(
  db: SqlDatabase,
  reference: { token: string; type: "model"; id: string; version: string | null },
) {
  const row = await queryOne<{
    id: string; model_code: string; display_name: string; media_type: string;
    updated_at: Date | string; revision_id: string | null; revision_snapshot: unknown; revision_created_at: Date | string | null;
  }>(db, `
    SELECT model.id,model.model_code,model.display_name,model.media_type,model.updated_at,
           revision.id AS revision_id,revision.snapshot_json AS revision_snapshot,
           revision.created_at AS revision_created_at
    FROM ai_model_configs model
    LEFT JOIN LATERAL (
      SELECT item.id,item.snapshot_json,item.created_at
      FROM ai_model_config_revisions item
      WHERE item.model_config_id=model.id
        AND ($2::text IS NULL OR item.id::text=$2)
      ORDER BY item.created_at DESC,item.id DESC LIMIT 1
    ) revision ON TRUE
    WHERE model.id=$1 AND model.status='active'
      AND ($2::text IS NULL OR revision.id IS NOT NULL)
    LIMIT 1
  `, [reference.id, reference.version]);
  if (!row) throw unavailable(reference);
  const snapshot = row.revision_id ? parseRecord(row.revision_snapshot) : {
    id: row.id,
    modelCode: row.model_code,
    displayName: row.display_name,
    mediaType: row.media_type,
  };
  const contentHash = hash(stableJson(snapshot));
  const resolvedVersionId = row.revision_id ?? row.id;
  return {
    value: `[model:${row.model_code}]`,
    snapshot: snapshotRecord(
      reference,
      resolvedVersionId,
      new Date(row.revision_created_at ?? row.updated_at).toISOString(),
      contentHash,
    ),
    executionBinding: {
      kind: "model" as const,
      modelConfigId: row.id,
      modelCode: row.model_code,
      modelConfigRevisionId: resolvedVersionId,
      contentHash,
    },
  };
}

async function resolveTeamAssetReference(
  db: SqlDatabase,
  scope: CanvasActorScope,
  reference: { token: string; type: "voice" | "drama"; id: string; version: string | null },
) {
  const row = await queryOne<{
    id: string; asset_name: string; asset_prompt: string | null; asset_category: string;
    asset_url: string | null; resource_type: string; updated_at: Date | string;
  }>(db, `
    SELECT id,asset_name,asset_prompt,asset_category,asset_url,resource_type,updated_at
    FROM team_assets
    WHERE id=$1 AND admin_user_id=$2 AND asset_status='active'
      AND (($3='voice' AND asset_category='voice')
        OR ($3='drama' AND asset_category IN ('character','scene','prop')))
    LIMIT 1
  `, [reference.id, scope.ownerUserId, reference.type]);
  if (!row) throw unavailable(reference);
  const contentHash = hash(stableJson({
    id: row.id,
    assetName: row.asset_name,
    assetPrompt: row.asset_prompt,
    assetCategory: row.asset_category,
    assetUrl: row.asset_url,
    resourceType: row.resource_type,
  }));
  if (reference.version && reference.version !== row.id && reference.version !== contentHash) {
    throw unavailable(reference);
  }
  const value = readString(row.asset_prompt)
    || `[${reference.type}:${row.asset_category}:${row.asset_name}]`;
  return {
    value,
    snapshot: snapshotRecord(reference, row.id, contentHash, contentHash),
    ...(reference.type === "voice" ? {
      executionBinding: {
        kind: "voice" as const,
        voiceAssetId: row.id,
        versionHash: contentHash,
        contentHash,
      },
    } : {}),
  };
}

async function resolveCanvasCharacterReference(
  db: SqlDatabase,
  scope: CanvasActorScope,
  reference: { token: string; type: "drama"; id: string; version: string | null },
): Promise<ResolvedReferenceValue | null> {
  if (!reference.version || (reference.version !== "all" && !UUID_PATTERN.test(reference.version))) return null;
  const character = await queryOne<{
    id: string;
    name: string;
    prompt_text: string;
    revision: number | string;
  }>(db, `
    SELECT id,name,prompt_text,revision
    FROM canvas_character_assets
    WHERE id=$1 AND owner_user_id=$2 AND deleted_at IS NULL
      AND (
        (scope='canvas' AND canvas_id=$3)
        OR (scope='global' AND principal_key=$4)
      )
    LIMIT 1
  `, [reference.id, scope.ownerUserId, scope.canvasId, scope.principalKey]);
  if (!character) return null;
  const rows = await db.query<{
    id: string;
    prompt_text: string;
    storage_object_id: string | null;
    resolved_asset_version_id: string | null;
  }>(`
    SELECT reference.id,reference.prompt_text,
           COALESCE(reference.storage_object_id,selected_version.storage_object_id,latest_version.storage_object_id) AS storage_object_id,
           COALESCE(reference.asset_version_id,latest_version.id) AS resolved_asset_version_id
    FROM canvas_character_asset_references reference
    LEFT JOIN asset_versions selected_version ON selected_version.id=reference.asset_version_id
    LEFT JOIN LATERAL (
      SELECT version.id,version.storage_object_id
      FROM asset_versions version
      WHERE version.asset_id=reference.asset_id
      ORDER BY version.version_number DESC,version.created_at DESC,version.id DESC
      LIMIT 1
    ) latest_version ON TRUE
    WHERE reference.character_id=$1 AND reference.deleted_at IS NULL
      AND ($2='all' OR reference.id::text=$2)
    ORDER BY reference.position,reference.id
  `, [reference.id, reference.version]);
  if (!rows.rows.length) throw unavailable(reference);
  const stableReferences = rows.rows.map((item) => ({
    referenceId: item.id,
    storageObjectId: item.storage_object_id,
    assetVersionId: item.resolved_asset_version_id,
  }));
  const value = joinPromptParts([
    readString(character.prompt_text),
    ...rows.rows.map((item) => readString(item.prompt_text)),
  ]) || `[drama:character:${character.name}]`;
  const contentHash = hash(stableJson({
    characterId: character.id,
    revision: Number(character.revision),
    selector: reference.version,
    value,
    references: stableReferences,
  }));
  return {
    value,
    snapshot: snapshotRecord(
      reference,
      reference.version === "all" ? character.id : rows.rows[0]!.id,
      Number(character.revision),
      contentHash,
    ),
    executionBinding: {
      kind: "drama",
      characterId: character.id,
      selector: reference.version,
      contentHash,
      references: stableReferences,
    },
  };
}

function snapshotRecord(
  reference: { token: string; type: CanvasPromptReferenceSnapshot["type"]; id: string; version: string | null },
  resolvedVersionId: string,
  resolvedVersion: number | string,
  contentHash: string,
): CanvasPromptReferenceSnapshot {
  return {
    token: reference.token,
    type: reference.type,
    id: reference.id,
    requestedVersion: reference.version,
    resolvedVersionId,
    resolvedVersion,
    contentHash,
  };
}

function assertRunScope(scope: CanvasActorScope) {
  if (!scope.canvasId || !scope.ownerUserId || !scope.capabilities.includes(capabilities.canvasRun)) {
    throw new CanvasPromptReferenceError("canvas_prompt_reference_forbidden");
  }
}

function unavailable(reference: { token: string; type: string; id: string; version: string | null }) {
  return new CanvasPromptReferenceError("canvas_prompt_reference_unavailable", reference);
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  }
  return {};
}

function validateDirectiveList(value: unknown): Array<{ id: string; version: string }> {
  if (!Array.isArray(value) || value.length > 20) {
    throw new CanvasPromptReferenceError("canvas_prompt_expansion_contract_invalid");
  }
  return value.map((item) => {
    const record = parseRecord(item);
    const keys = Object.keys(record).sort();
    const id = readString(record.id);
    const version = readString(record.version);
    if (
      keys.length !== 2 || keys[0] !== "id" || keys[1] !== "version"
      || !REFERENCE_ID_PATTERN.test(id) || !REFERENCE_ID_PATTERN.test(version)
    ) {
      throw new CanvasPromptReferenceError("canvas_prompt_expansion_contract_invalid");
    }
    return { id, version };
  });
}

function resolveDirectiveStage(
  stage: CanvasPromptDirectiveStage,
  requested: Array<{ id: string; version: string }>,
  catalog: CanvasPromptDirectiveCatalogRecord[] | undefined,
) {
  const records = Array.isArray(catalog) ? catalog : [];
  return requested.map((reference) => {
    const record = records.find((item) => item.id === reference.id && item.version === reference.version);
    const errorReference = {
      token: `${stage}:${reference.id}@${reference.version}`,
      type: stage,
      id: reference.id,
      version: reference.version,
    };
    if (!record || record.accessible === false || record.status && record.status !== "active") {
      throw new CanvasPromptReferenceError("canvas_prompt_directive_unavailable", errorReference);
    }
    const content = readString(record.content);
    const contentHash = readString(record.contentHash);
    if (!content) throw new CanvasPromptReferenceError("canvas_prompt_directive_value_missing", errorReference);
    if (!/^[a-f0-9]{64}$/.test(contentHash) || hash(content) !== contentHash) {
      throw new CanvasPromptReferenceError("canvas_prompt_directive_hash_mismatch", errorReference);
    }
    return { stage, id: reference.id, version: reference.version, content, contentHash };
  });
}

function resolveExecutionBindings(state: ReferenceExpansionState) {
  return {
    model: uniqueExecutionBinding(state.modelBindings, "canvas_prompt_model_binding_ambiguous"),
    voice: uniqueExecutionBinding(state.voiceBindings, "canvas_prompt_voice_binding_ambiguous"),
    drama: [...new Map(state.dramaBindings.map((item) => [
      `${item.characterId}@${item.selector}@${item.contentHash}`,
      item,
    ])).values()],
  };
}

function uniqueExecutionBinding<T extends CanvasPromptModelExecutionBinding | CanvasPromptVoiceExecutionBinding>(
  values: T[],
  errorCode: string,
): T | null {
  const unique = new Map(values.map((item) => [
    item.kind === "model"
      ? `${item.modelConfigId}@${item.modelConfigRevisionId}`
      : `${item.voiceAssetId}@${item.versionHash}`,
    item,
  ]));
  if (unique.size > 1) throw new CanvasPromptReferenceError(errorCode);
  return unique.values().next().value ?? null;
}

function uniqueReadDependencies(values: CanvasPromptNodeReadDependency[]) {
  return [...new Map(values.map((item) => [
    `${item.nodeKey}@${item.documentVersionId}`,
    item,
  ])).values()];
}

function joinPromptParts(parts: string[]) {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n");
}

function readNodeReferenceValue(node: Record<string, unknown>) {
  const data = parseRecord(node.data);
  for (const candidate of [data.prompt, data.text, data.description, data.value, node.prompt, node.text, node.description, node.title]) {
    const value = readString(candidate);
    if (value) return value;
  }
  return "";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function stringList(value: unknown) {
  return arrayList(value).map(readString).filter(Boolean);
}

function arrayList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

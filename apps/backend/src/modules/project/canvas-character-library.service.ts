import { randomUUID } from "node:crypto";

import {
  assertCanvasActorAction,
  type CanvasActorScope,
} from "../identity/canvas-actor-scope.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_SNAPSHOT_KEYS = new Set([
  "url", "uri", "signedurl", "signed_url", "downloadurl", "download_url",
  "previewurl", "preview_url", "dataurl", "data_url", "base64", "blob", "bytes", "binary",
]);

export type CanvasCharacterScope = "canvas" | "global";

export interface CanvasCharacterCrop {
  x: number;
  y: number;
  width: number;
  height: number;
  unit: "ratio" | "pixel";
}

export interface CanvasCharacterReferenceInput {
  position?: number;
  usage?: string;
  prompt?: string;
  crop?: CanvasCharacterCrop | null;
  primary?: boolean;
  avatar?: boolean;
  storageObjectId?: string | null;
  assetId?: string | null;
  assetVersionId?: string | null;
  sourceNodeId?: string | null;
  sourceSnapshot?: Record<string, unknown> | null;
}

export class CanvasCharacterLibraryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CanvasCharacterLibraryError";
  }
}

interface CharacterRow {
  id: string;
  owner_user_id: string;
  scope: CanvasCharacterScope;
  canvas_id: string | null;
  principal_key: string | null;
  name: string;
  description_text: string;
  prompt_text: string;
  revision: number | string;
  created_by_principal_key: string;
  created_by_team_member_id: string | null;
  updated_by_principal_key: string;
  updated_by_team_member_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ReferenceRow {
  id: string;
  character_id: string;
  position: number | string;
  usage: string;
  prompt_text: string;
  crop_json: unknown;
  is_primary: boolean;
  is_avatar: boolean;
  storage_object_id: string | null;
  asset_id: string | null;
  asset_version_id: string | null;
  source_node_id: string | null;
  source_snapshot_json: unknown;
  created_by_principal_key: string;
  created_by_team_member_id: string | null;
  updated_by_principal_key: string;
  updated_by_team_member_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface NormalizedReference {
  position: number;
  usage: string;
  prompt: string;
  crop: CanvasCharacterCrop | null;
  primary: boolean;
  avatar: boolean;
  storageObjectId: string | null;
  assetId: string | null;
  assetVersionId: string | null;
  sourceNodeId: string | null;
  sourceSnapshot: Record<string, unknown>;
}

export async function listCanvasCharacters(
  db: SqlDatabase,
  input: { actorScope: CanvasActorScope; scope?: CanvasCharacterScope; limit?: number },
) {
  assertCanvasActorAction(input.actorScope, "view");
  const scope = input.scope === undefined ? null : normalizeScope(input.scope);
  const limit = boundedInteger(input.limit, 100, 1, 500);
  const rows = await db.query<CharacterRow>(`
    SELECT * FROM canvas_character_assets
    WHERE owner_user_id=$1 AND deleted_at IS NULL
      AND (
        (scope='canvas' AND canvas_id=$2)
        OR (scope='global' AND principal_key=$3)
      )
      AND ($4::text IS NULL OR scope=$4)
    ORDER BY updated_at DESC,id DESC
    LIMIT $5
  `, [
    input.actorScope.ownerUserId,
    input.actorScope.canvasId,
    input.actorScope.principalKey,
    scope,
    limit,
  ]);
  return attachReferences(db, rows.rows);
}

export async function getCanvasCharacter(
  db: SqlDatabase,
  input: { actorScope: CanvasActorScope; characterId: string },
) {
  assertCanvasActorAction(input.actorScope, "view");
  const character = await findCharacter(db, input.actorScope, requiredUuid(input.characterId), false);
  if (!character) throw new CanvasCharacterLibraryError("canvas_character_not_found");
  return (await attachReferences(db, [character]))[0];
}

export async function createCanvasCharacter(
  db: SqlDatabase,
  input: {
    actorScope: CanvasActorScope;
    scope: CanvasCharacterScope;
    name: string;
    description?: string;
    prompt?: string;
    references?: CanvasCharacterReferenceInput[];
    now: Date;
  },
) {
  assertCanvasActorAction(input.actorScope, "edit");
  const scope = normalizeScope(input.scope);
  const references = normalizeReferenceList(input.references ?? []);
  await validateMediaReferences(db, input.actorScope, references);
  const characterId = randomUUID();
  await withTransaction(db, async () => {
    await db.query(`
      INSERT INTO canvas_character_assets (
        id,owner_user_id,scope,canvas_id,principal_key,name,description_text,prompt_text,
        created_by_principal_key,created_by_team_member_id,
        updated_by_principal_key,updated_by_team_member_id,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9,$10,$11,$11)
    `, [
      characterId,
      input.actorScope.ownerUserId,
      scope,
      scope === "canvas" ? input.actorScope.canvasId : null,
      scope === "global" ? input.actorScope.principalKey : null,
      boundedString(input.name, 120, "canvas_character_name_invalid", true),
      boundedString(input.description ?? "", 4_000, "canvas_character_description_invalid"),
      boundedString(input.prompt ?? "", 20_000, "canvas_character_prompt_invalid"),
      input.actorScope.principalKey,
      input.actorScope.actorTeamMemberId,
      input.now,
    ]);
    for (const reference of references) {
      await insertReference(db, characterId, input.actorScope, reference, input.now);
    }
  });
  return getCanvasCharacter(db, { actorScope: input.actorScope, characterId });
}

export async function updateCanvasCharacter(
  db: SqlDatabase,
  input: {
    actorScope: CanvasActorScope;
    characterId: string;
    expectedRevision: number;
    patch: { name?: string; description?: string; prompt?: string };
    now: Date;
  },
) {
  assertCanvasActorAction(input.actorScope, "edit");
  assertKnownKeys(input.patch, ["name", "description", "prompt"]);
  const characterId = requiredUuid(input.characterId);
  const expectedRevision = validRevision(input.expectedRevision);
  await withTransaction(db, async () => {
    const current = await requireLockedCharacter(db, input.actorScope, characterId, expectedRevision);
    await db.query(`
      UPDATE canvas_character_assets
      SET name=$3,description_text=$4,prompt_text=$5,revision=revision+1,
          updated_by_principal_key=$6,updated_by_team_member_id=$7,updated_at=$8
      WHERE id=$1 AND revision=$2 AND deleted_at IS NULL
    `, [
      characterId,
      expectedRevision,
      input.patch.name === undefined ? current.name : boundedString(input.patch.name, 120, "canvas_character_name_invalid", true),
      input.patch.description === undefined ? current.description_text : boundedString(input.patch.description, 4_000, "canvas_character_description_invalid"),
      input.patch.prompt === undefined ? current.prompt_text : boundedString(input.patch.prompt, 20_000, "canvas_character_prompt_invalid"),
      input.actorScope.principalKey,
      input.actorScope.actorTeamMemberId,
      input.now,
    ]);
  });
  return getCanvasCharacter(db, { actorScope: input.actorScope, characterId });
}

export async function deleteCanvasCharacter(
  db: SqlDatabase,
  input: { actorScope: CanvasActorScope; characterId: string; expectedRevision: number; now: Date },
) {
  assertCanvasActorAction(input.actorScope, "edit");
  const characterId = requiredUuid(input.characterId);
  const expectedRevision = validRevision(input.expectedRevision);
  return withTransaction(db, async () => {
    await requireLockedCharacter(db, input.actorScope, characterId, expectedRevision);
    const sources = await db.query<{ source_node_id: string }>(`
      SELECT DISTINCT source_node_id FROM canvas_character_asset_references
      WHERE character_id=$1 AND deleted_at IS NULL AND source_node_id IS NOT NULL
      ORDER BY source_node_id
    `, [characterId]);
    await db.query(`
      UPDATE canvas_character_asset_references
      SET deleted_at=$2,updated_at=$2,updated_by_principal_key=$3,updated_by_team_member_id=$4
      WHERE character_id=$1 AND deleted_at IS NULL
    `, [characterId, input.now, input.actorScope.principalKey, input.actorScope.actorTeamMemberId]);
    await db.query(`
      UPDATE canvas_character_assets
      SET deleted_at=$3,revision=revision+1,updated_at=$3,
          updated_by_principal_key=$4,updated_by_team_member_id=$5
      WHERE id=$1 AND revision=$2 AND deleted_at IS NULL
    `, [characterId, expectedRevision, input.now, input.actorScope.principalKey, input.actorScope.actorTeamMemberId]);
    return {
      characterId,
      revision: expectedRevision + 1,
      sourceNodeIds: sources.rows.map((row) => row.source_node_id),
    };
  });
}

export async function addCanvasCharacterReference(
  db: SqlDatabase,
  input: {
    actorScope: CanvasActorScope;
    characterId: string;
    expectedRevision: number;
    reference: CanvasCharacterReferenceInput;
    now: Date;
  },
) {
  assertCanvasActorAction(input.actorScope, "edit");
  const characterId = requiredUuid(input.characterId);
  const expectedRevision = validRevision(input.expectedRevision);
  let createdId = "";
  await withTransaction(db, async () => {
    await requireLockedCharacter(db, input.actorScope, characterId, expectedRevision);
    const defaultPosition = await nextReferencePosition(db, characterId);
    const reference = normalizeReference(input.reference, defaultPosition);
    await validateMediaReferences(db, input.actorScope, [reference]);
    await clearExclusiveReferenceFlags(db, characterId, null, reference, input.actorScope, input.now);
    createdId = await insertReference(db, characterId, input.actorScope, reference, input.now);
    await bumpCharacterRevision(db, characterId, expectedRevision, input.actorScope, input.now);
  });
  const character = await getCanvasCharacter(db, { actorScope: input.actorScope, characterId });
  return { character, reference: character.references.find((reference) => reference.id === createdId)! };
}

export async function updateCanvasCharacterReference(
  db: SqlDatabase,
  input: {
    actorScope: CanvasActorScope;
    characterId: string;
    referenceId: string;
    expectedRevision: number;
    patch: CanvasCharacterReferenceInput;
    now: Date;
  },
) {
  assertCanvasActorAction(input.actorScope, "edit");
  const characterId = requiredUuid(input.characterId);
  const referenceId = requiredUuid(input.referenceId);
  const expectedRevision = validRevision(input.expectedRevision);
  await withTransaction(db, async () => {
    await requireLockedCharacter(db, input.actorScope, characterId, expectedRevision);
    const current = await queryOne<ReferenceRow>(db, `
      SELECT * FROM canvas_character_asset_references
      WHERE id=$1 AND character_id=$2 AND deleted_at IS NULL
      FOR UPDATE
    `, [referenceId, characterId]);
    if (!current) throw new CanvasCharacterLibraryError("canvas_character_reference_not_found");
    const reference = normalizeReference({ ...referenceInputFromRow(current), ...input.patch }, Number(current.position));
    await validateMediaReferences(db, input.actorScope, [reference]);
    await clearExclusiveReferenceFlags(db, characterId, referenceId, reference, input.actorScope, input.now);
    await db.query(`
      UPDATE canvas_character_asset_references
      SET position=$3,usage=$4,prompt_text=$5,crop_json=$6::jsonb,
          is_primary=$7,is_avatar=$8,storage_object_id=$9,asset_id=$10,asset_version_id=$11,
          source_node_id=$12,source_snapshot_json=$13::jsonb,
          updated_by_principal_key=$14,updated_by_team_member_id=$15,updated_at=$16
      WHERE id=$1 AND character_id=$2 AND deleted_at IS NULL
    `, [
      referenceId, characterId, reference.position, reference.usage, reference.prompt,
      JSON.stringify(reference.crop ?? {}), reference.primary, reference.avatar,
      reference.storageObjectId, reference.assetId, reference.assetVersionId,
      reference.sourceNodeId, JSON.stringify(reference.sourceSnapshot),
      input.actorScope.principalKey, input.actorScope.actorTeamMemberId, input.now,
    ]);
    await bumpCharacterRevision(db, characterId, expectedRevision, input.actorScope, input.now);
  });
  return getCanvasCharacter(db, { actorScope: input.actorScope, characterId });
}

export async function deleteCanvasCharacterReference(
  db: SqlDatabase,
  input: {
    actorScope: CanvasActorScope;
    characterId: string;
    referenceId: string;
    expectedRevision: number;
    now: Date;
  },
) {
  assertCanvasActorAction(input.actorScope, "edit");
  const characterId = requiredUuid(input.characterId);
  const referenceId = requiredUuid(input.referenceId);
  const expectedRevision = validRevision(input.expectedRevision);
  return withTransaction(db, async () => {
    await requireLockedCharacter(db, input.actorScope, characterId, expectedRevision);
    const reference = await queryOne<{ source_node_id: string | null }>(db, `
      UPDATE canvas_character_asset_references
      SET deleted_at=$3,updated_at=$3,updated_by_principal_key=$4,updated_by_team_member_id=$5
      WHERE id=$1 AND character_id=$2 AND deleted_at IS NULL
      RETURNING source_node_id
    `, [referenceId, characterId, input.now, input.actorScope.principalKey, input.actorScope.actorTeamMemberId]);
    if (!reference) throw new CanvasCharacterLibraryError("canvas_character_reference_not_found");
    await bumpCharacterRevision(db, characterId, expectedRevision, input.actorScope, input.now);
    return {
      characterId,
      referenceId,
      revision: expectedRevision + 1,
      sourceNodeIds: reference.source_node_id ? [reference.source_node_id] : [],
    };
  });
}

export async function copyCanvasCharacter(
  db: SqlDatabase,
  input: {
    actorScope: CanvasActorScope;
    sourceCharacterId: string;
    expectedRevision: number;
    targetScope: CanvasCharacterScope;
    name?: string;
    now: Date;
  },
) {
  assertCanvasActorAction(input.actorScope, "edit");
  const sourceCharacterId = requiredUuid(input.sourceCharacterId);
  const expectedRevision = validRevision(input.expectedRevision);
  const targetScope = normalizeScope(input.targetScope);
  const characterId = randomUUID();
  await withTransaction(db, async () => {
    const source = await requireLockedCharacter(db, input.actorScope, sourceCharacterId, expectedRevision);
    const references = normalizeReferenceList((await listReferences(db, [sourceCharacterId])).map(referenceInputFromRow));
    await validateMediaReferences(db, input.actorScope, references);
    await db.query(`
      INSERT INTO canvas_character_assets (
        id,owner_user_id,scope,canvas_id,principal_key,name,description_text,prompt_text,
        created_by_principal_key,created_by_team_member_id,
        updated_by_principal_key,updated_by_team_member_id,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$9,$10,$11,$11)
    `, [
      characterId,
      input.actorScope.ownerUserId,
      targetScope,
      targetScope === "canvas" ? input.actorScope.canvasId : null,
      targetScope === "global" ? input.actorScope.principalKey : null,
      input.name === undefined ? source.name : boundedString(input.name, 120, "canvas_character_name_invalid", true),
      source.description_text,
      source.prompt_text,
      input.actorScope.principalKey,
      input.actorScope.actorTeamMemberId,
      input.now,
    ]);
    for (const reference of references) {
      await insertReference(db, characterId, input.actorScope, reference, input.now);
    }
  });
  return getCanvasCharacter(db, { actorScope: input.actorScope, characterId });
}

async function findCharacter(
  db: SqlDatabase,
  actorScope: CanvasActorScope,
  characterId: string,
  lock: boolean,
) {
  return queryOne<CharacterRow>(db, `
    SELECT * FROM canvas_character_assets
    WHERE id=$1 AND owner_user_id=$2 AND deleted_at IS NULL
      AND (
        (scope='canvas' AND canvas_id=$3)
        OR (scope='global' AND principal_key=$4)
      )
    ${lock ? "FOR UPDATE" : ""}
  `, [characterId, actorScope.ownerUserId, actorScope.canvasId, actorScope.principalKey]);
}

async function requireLockedCharacter(
  db: SqlDatabase,
  actorScope: CanvasActorScope,
  characterId: string,
  expectedRevision: number,
) {
  const character = await findCharacter(db, actorScope, characterId, true);
  if (!character) throw new CanvasCharacterLibraryError("canvas_character_not_found");
  if (Number(character.revision) !== expectedRevision) {
    throw new CanvasCharacterLibraryError("canvas_character_revision_conflict");
  }
  return character;
}

async function bumpCharacterRevision(
  db: SqlDatabase,
  characterId: string,
  expectedRevision: number,
  actorScope: CanvasActorScope,
  now: Date,
) {
  const updated = await queryOne<{ id: string }>(db, `
    UPDATE canvas_character_assets
    SET revision=revision+1,updated_by_principal_key=$3,
        updated_by_team_member_id=$4,updated_at=$5
    WHERE id=$1 AND revision=$2 AND deleted_at IS NULL
    RETURNING id
  `, [characterId, expectedRevision, actorScope.principalKey, actorScope.actorTeamMemberId, now]);
  if (!updated) throw new CanvasCharacterLibraryError("canvas_character_revision_conflict");
}

async function insertReference(
  db: SqlDatabase,
  characterId: string,
  actorScope: CanvasActorScope,
  reference: NormalizedReference,
  now: Date,
) {
  const id = randomUUID();
  try {
    await db.query(`
      INSERT INTO canvas_character_asset_references (
        id,character_id,position,usage,prompt_text,crop_json,is_primary,is_avatar,
        storage_object_id,asset_id,asset_version_id,source_node_id,source_snapshot_json,
        created_by_principal_key,created_by_team_member_id,
        updated_by_principal_key,updated_by_team_member_id,created_at,updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$14,$15,$16,$16)
    `, [
      id, characterId, reference.position, reference.usage, reference.prompt,
      JSON.stringify(reference.crop ?? {}), reference.primary, reference.avatar,
      reference.storageObjectId, reference.assetId, reference.assetVersionId,
      reference.sourceNodeId, JSON.stringify(reference.sourceSnapshot),
      actorScope.principalKey, actorScope.actorTeamMemberId, now,
    ]);
  } catch (error) {
    throw translateDatabaseError(error);
  }
  return id;
}

async function clearExclusiveReferenceFlags(
  db: SqlDatabase,
  characterId: string,
  referenceId: string | null,
  reference: Pick<NormalizedReference, "primary" | "avatar">,
  actorScope: CanvasActorScope,
  now: Date,
) {
  if (!reference.primary && !reference.avatar) return;
  await db.query(`
    UPDATE canvas_character_asset_references
    SET is_primary=CASE WHEN $3 THEN false ELSE is_primary END,
        is_avatar=CASE WHEN $4 THEN false ELSE is_avatar END,
        updated_by_principal_key=$5,updated_by_team_member_id=$6,updated_at=$7
    WHERE character_id=$1 AND deleted_at IS NULL AND ($2::uuid IS NULL OR id<>$2)
      AND (($3 AND is_primary=true) OR ($4 AND is_avatar=true))
  `, [characterId, referenceId, reference.primary, reference.avatar, actorScope.principalKey, actorScope.actorTeamMemberId, now]);
}

async function nextReferencePosition(db: SqlDatabase, characterId: string) {
  const row = await queryOne<{ next_position: number | string }>(db, `
    SELECT COALESCE(MAX(position),-1)+1 AS next_position
    FROM canvas_character_asset_references
    WHERE character_id=$1 AND deleted_at IS NULL
  `, [characterId]);
  return Number(row?.next_position ?? 0);
}

async function attachReferences(db: SqlDatabase, rows: CharacterRow[]) {
  const references = await listReferences(db, rows.map((row) => row.id));
  const byCharacter = new Map<string, ReturnType<typeof referenceRecord>[]>();
  for (const row of references) {
    const list = byCharacter.get(row.character_id) ?? [];
    list.push(referenceRecord(row));
    byCharacter.set(row.character_id, list);
  }
  return rows.map((row) => ({ ...characterRecord(row), references: byCharacter.get(row.id) ?? [] }));
}

async function listReferences(db: SqlDatabase, characterIds: string[]) {
  if (!characterIds.length) return [];
  const result = await db.query<ReferenceRow>(`
    SELECT * FROM canvas_character_asset_references
    WHERE character_id=ANY($1::uuid[]) AND deleted_at IS NULL
    ORDER BY character_id,position,id
  `, [characterIds]);
  return result.rows;
}

function characterRecord(row: CharacterRow) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    scope: row.scope,
    canvasId: row.canvas_id,
    principalKey: row.principal_key,
    name: row.name,
    description: row.description_text,
    prompt: row.prompt_text,
    revision: Number(row.revision),
    createdByPrincipalKey: row.created_by_principal_key,
    createdByTeamMemberId: row.created_by_team_member_id,
    updatedByPrincipalKey: row.updated_by_principal_key,
    updatedByTeamMemberId: row.updated_by_team_member_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function referenceRecord(row: ReferenceRow) {
  return {
    id: row.id,
    characterId: row.character_id,
    position: Number(row.position),
    usage: row.usage,
    prompt: row.prompt_text,
    crop: cropRecord(row.crop_json),
    primary: row.is_primary,
    avatar: row.is_avatar,
    storageObjectId: row.storage_object_id,
    assetId: row.asset_id,
    assetVersionId: row.asset_version_id,
    sourceNodeId: row.source_node_id,
    sourceSnapshot: readRecord(row.source_snapshot_json),
    createdByPrincipalKey: row.created_by_principal_key,
    createdByTeamMemberId: row.created_by_team_member_id,
    updatedByPrincipalKey: row.updated_by_principal_key,
    updatedByTeamMemberId: row.updated_by_team_member_id,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function referenceInputFromRow(row: ReferenceRow): CanvasCharacterReferenceInput {
  return {
    position: Number(row.position),
    usage: row.usage,
    prompt: row.prompt_text,
    crop: cropRecord(row.crop_json),
    primary: row.is_primary,
    avatar: row.is_avatar,
    storageObjectId: row.storage_object_id,
    assetId: row.asset_id,
    assetVersionId: row.asset_version_id,
    sourceNodeId: row.source_node_id,
    sourceSnapshot: readRecord(row.source_snapshot_json),
  };
}

function normalizeReferenceList(inputs: CanvasCharacterReferenceInput[]) {
  if (!Array.isArray(inputs) || inputs.length > 100) throw new CanvasCharacterLibraryError("canvas_character_references_invalid");
  const references = inputs.map((input, index) => normalizeReference(input, index));
  if (new Set(references.map((reference) => reference.position)).size !== references.length) {
    throw new CanvasCharacterLibraryError("canvas_character_reference_position_conflict");
  }
  if (references.filter((reference) => reference.primary).length > 1) {
    throw new CanvasCharacterLibraryError("canvas_character_primary_conflict");
  }
  if (references.filter((reference) => reference.avatar).length > 1) {
    throw new CanvasCharacterLibraryError("canvas_character_avatar_conflict");
  }
  return references;
}

function normalizeReference(input: CanvasCharacterReferenceInput, defaultPosition: number): NormalizedReference {
  const record = readRecord(input);
  assertKnownKeys(record, [
    "position", "usage", "prompt", "crop", "primary", "avatar", "storageObjectId",
    "assetId", "assetVersionId", "sourceNodeId", "sourceSnapshot",
  ]);
  const position = record.position === undefined ? defaultPosition : Number(record.position);
  if (!Number.isSafeInteger(position) || position < 0 || position > 100_000) {
    throw new CanvasCharacterLibraryError("canvas_character_reference_position_invalid");
  }
  const primary = optionalBoolean(record.primary, false, "canvas_character_primary_invalid");
  const avatar = optionalBoolean(record.avatar, false, "canvas_character_avatar_invalid");
  const storageObjectId = optionalUuid(record.storageObjectId);
  const assetId = optionalUuid(record.assetId);
  const assetVersionId = optionalUuid(record.assetVersionId);
  if (!storageObjectId && !assetId && !assetVersionId) {
    throw new CanvasCharacterLibraryError("canvas_character_reference_media_required");
  }
  return {
    position,
    usage: boundedString(record.usage ?? "reference", 80, "canvas_character_reference_usage_invalid", true),
    prompt: boundedString(record.prompt ?? "", 20_000, "canvas_character_reference_prompt_invalid"),
    crop: normalizeCrop(record.crop),
    primary,
    avatar,
    storageObjectId,
    assetId,
    assetVersionId,
    sourceNodeId: optionalString(record.sourceNodeId, 160, "canvas_character_source_node_invalid"),
    sourceSnapshot: normalizeSourceSnapshot(record.sourceSnapshot),
  };
}

function normalizeCrop(value: unknown): CanvasCharacterCrop | null {
  if (value === undefined || value === null) return null;
  const crop = readRecord(value);
  assertKnownKeys(crop, ["x", "y", "width", "height", "unit"]);
  const unit = crop.unit === undefined ? "ratio" : crop.unit;
  if (unit !== "ratio" && unit !== "pixel") throw new CanvasCharacterLibraryError("canvas_character_crop_invalid");
  const x = finiteNumber(crop.x);
  const y = finiteNumber(crop.y);
  const width = finiteNumber(crop.width);
  const height = finiteNumber(crop.height);
  const maximum = unit === "ratio" ? 1 : 100_000;
  if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > maximum || y + height > maximum) {
    throw new CanvasCharacterLibraryError("canvas_character_crop_invalid");
  }
  return { x, y, width, height, unit };
}

function cropRecord(value: unknown) {
  const record = readRecord(value);
  return Object.keys(record).length ? normalizeCrop(record) : null;
}

function normalizeSourceSnapshot(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  const normalized = normalizeJsonValue(value, null);
  if (!normalized || Array.isArray(normalized) || typeof normalized !== "object") {
    throw new CanvasCharacterLibraryError("canvas_character_source_snapshot_invalid");
  }
  if (Buffer.byteLength(JSON.stringify(normalized), "utf8") > 32 * 1024) {
    throw new CanvasCharacterLibraryError("canvas_character_source_snapshot_too_large");
  }
  return normalized as Record<string, unknown>;
}

function normalizeJsonValue(value: unknown, key: string | null): unknown {
  if (key && FORBIDDEN_SNAPSHOT_KEYS.has(key.toLowerCase())) {
    throw new CanvasCharacterLibraryError("canvas_character_embedded_media_forbidden");
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new CanvasCharacterLibraryError("canvas_character_source_snapshot_invalid");
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^(?:https?:|data:|blob:)/i.test(trimmed) || (trimmed.length >= 256 && trimmed.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(trimmed))) {
      throw new CanvasCharacterLibraryError("canvas_character_embedded_media_forbidden");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((item) => normalizeJsonValue(item, null));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([itemKey, itemValue]) => [
      itemKey,
      normalizeJsonValue(itemValue, itemKey),
    ]));
  }
  throw new CanvasCharacterLibraryError("canvas_character_source_snapshot_invalid");
}

async function validateMediaReferences(
  db: SqlDatabase,
  actorScope: CanvasActorScope,
  references: NormalizedReference[],
) {
  for (const reference of references) {
    const row = await queryOne<{
      storage_object_id: string | null;
      storage_authorized: boolean | null;
      asset_id: string | null;
      asset_authorized: boolean | null;
      version_asset_id: string | null;
      version_storage_object_id: string | null;
      version_authorized: boolean | null;
    }>(db, `
      SELECT
        storage.id AS storage_object_id,
        CASE WHEN storage.id IS NULL THEN NULL ELSE
          storage.created_by_user_id=$4 OR storage_canvas.id IS NOT NULL
        END AS storage_authorized,
        asset.id AS asset_id,
        CASE WHEN asset.id IS NULL THEN NULL ELSE
          asset.created_by_user_id=$4 OR asset_canvas.id IS NOT NULL
        END AS asset_authorized,
        version.asset_id AS version_asset_id,
        version.storage_object_id AS version_storage_object_id,
        CASE WHEN version.id IS NULL THEN NULL ELSE
          version.created_by_user_id=$4 OR version_asset.created_by_user_id=$4 OR version_canvas.id IS NOT NULL
        END AS version_authorized
      FROM (SELECT 1) seed
      LEFT JOIN storage_objects storage ON storage.id=$1 AND storage.deleted_at IS NULL
      LEFT JOIN creator_canvas_projects storage_canvas
        ON storage_canvas.id=storage.canvas_project_id
       AND storage_canvas.created_by_user_id=$4
       AND storage_canvas.deleted_at IS NULL
      LEFT JOIN assets asset ON asset.id=$2
      LEFT JOIN creator_canvas_projects asset_canvas
        ON asset_canvas.id=asset.canvas_project_id
       AND asset_canvas.created_by_user_id=$4
       AND asset_canvas.deleted_at IS NULL
      LEFT JOIN asset_versions version ON version.id=$3
      LEFT JOIN assets version_asset ON version_asset.id=version.asset_id
      LEFT JOIN creator_canvas_projects version_canvas
        ON version_canvas.id=version_asset.canvas_project_id
       AND version_canvas.created_by_user_id=$4
       AND version_canvas.deleted_at IS NULL
    `, [reference.storageObjectId, reference.assetId, reference.assetVersionId, actorScope.ownerUserId]);
    if (reference.storageObjectId && (!row?.storage_object_id || row.storage_authorized !== true)) {
      throw new CanvasCharacterLibraryError("canvas_character_storage_object_not_found");
    }
    if (reference.assetId && (!row?.asset_id || row.asset_authorized !== true)) {
      throw new CanvasCharacterLibraryError("canvas_character_asset_not_found");
    }
    if (reference.assetVersionId && (!row?.version_asset_id || row.version_authorized !== true)) {
      throw new CanvasCharacterLibraryError("canvas_character_asset_version_not_found");
    }
    if (reference.assetId && row?.version_asset_id && reference.assetId !== row.version_asset_id) {
      throw new CanvasCharacterLibraryError("canvas_character_asset_reference_mismatch");
    }
    if (reference.storageObjectId && row?.version_storage_object_id && reference.storageObjectId !== row.version_storage_object_id) {
      throw new CanvasCharacterLibraryError("canvas_character_asset_reference_mismatch");
    }
  }
}

function normalizeScope(value: unknown): CanvasCharacterScope {
  if (value !== "canvas" && value !== "global") throw new CanvasCharacterLibraryError("canvas_character_scope_invalid");
  return value;
}

function requiredUuid(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!UUID_PATTERN.test(normalized)) throw new CanvasCharacterLibraryError("canvas_character_id_invalid");
  return normalized;
}

function optionalUuid(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  const normalized = String(value).trim();
  if (!UUID_PATTERN.test(normalized)) throw new CanvasCharacterLibraryError("canvas_character_reference_id_invalid");
  return normalized;
}

function validRevision(value: unknown) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new CanvasCharacterLibraryError("canvas_character_revision_invalid");
  return revision;
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? Math.min(maximum, Math.max(minimum, parsed)) : fallback;
}

function boundedString(value: unknown, maximum: number, code: string, required = false) {
  if (typeof value !== "string" || value.length > maximum) throw new CanvasCharacterLibraryError(code);
  const normalized = value.trim();
  if (required && !normalized) throw new CanvasCharacterLibraryError(code);
  return normalized;
}

function optionalString(value: unknown, maximum: number, code: string) {
  if (value === undefined || value === null || value === "") return null;
  return boundedString(value, maximum, code, true);
}

function optionalBoolean(value: unknown, fallback: boolean, code: string) {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new CanvasCharacterLibraryError(code);
  return value;
}

function finiteNumber(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new CanvasCharacterLibraryError("canvas_character_crop_invalid");
  return number;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function assertKnownKeys(record: Record<string, unknown>, keys: readonly string[]) {
  const allowed = new Set(keys);
  if (Object.keys(record).some((key) => !allowed.has(key))) {
    throw new CanvasCharacterLibraryError("canvas_character_field_invalid");
  }
}

function translateDatabaseError(error: unknown) {
  const constraint = String((error as { constraint?: unknown })?.constraint ?? "");
  if (constraint.includes("primary")) return new CanvasCharacterLibraryError("canvas_character_primary_conflict");
  if (constraint.includes("avatar")) return new CanvasCharacterLibraryError("canvas_character_avatar_conflict");
  if (constraint.includes("position")) return new CanvasCharacterLibraryError("canvas_character_reference_position_conflict");
  return error;
}

async function withTransaction<T>(db: SqlDatabase, operation: () => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    const result = await operation();
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw translateDatabaseError(error);
  }
}

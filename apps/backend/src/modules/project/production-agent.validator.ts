import type { ProductionManifest } from "./production-agent.types.ts";
import { validateProductionManifestRevision } from "./production-agent.manifest-version.ts";

export function validateProductionManifest(manifest: unknown) {
  const errors: string[] = [];
  if (!isRecord(manifest)) return { valid: false, errors: ["production_manifest_invalid"] };
  if (manifest.schemaVersion !== "creator-production.v1") errors.push("schema_version_invalid");
  const source = isRecord(manifest.source) ? manifest.source : null;
  if (!source || !["novel", "script", "text"].includes(String(source.kind ?? ""))) errors.push("source_kind_invalid");
  const project = isRecord(manifest.project) ? manifest.project : null;
  if (!String(project?.projectId ?? "").trim()) errors.push("project_id_required");
  const scenes = readRecords(manifest.scenes, "scenes", errors);
  const characters = readRecords(manifest.characters, "characters", errors);
  const props = readRecords(manifest.props, "props", errors);
  const storyboards = readRecords(manifest.storyboards, "storyboards", errors);
  if (!String(manifest.scriptText ?? "").trim() && !storyboards.length && !characters.length && !scenes.length && !props.length) {
    errors.push("production_manifest_empty");
  }
  errors.push(...validateProductionManifestRevision(manifest as unknown as ProductionManifest));
  const keys = new Set<string>();
  for (const [kind, records] of [["character", characters], ["scene", scenes], ["prop", props]] as const) {
    for (const [index, record] of records.entries()) {
      const name = String(record.name ?? record[`${kind}Name`] ?? "").trim();
      if (!name) errors.push(`${kind}_${index}_name_required`);
      const key = String(record.key ?? "").trim();
      if (!key) errors.push(`${kind}_${index}_key_required`);
      if (key && keys.has(key)) errors.push(`asset_key_duplicate:${key}`);
      if (key) keys.add(key);
    }
  }
  for (const [index, shot] of storyboards.entries()) {
    if (!String(shot.plot ?? shot.description ?? "").trim()) errors.push(`shot_${index}_plot_required`);
    const refs = [...(Array.isArray(shot.characterKeys) ? shot.characterKeys : []), shot.sceneKey, ...(Array.isArray(shot.propKeys) ? shot.propKeys : [])];
    // References may target assets already persisted in the project (by id or
    // name), so ownership/type resolution is deferred to the commit service.
    // Keep rejecting malformed non-string values while preserving the
    // manifest-key set for callers that inspect it during validation.
    for (const ref of refs) {
      if (ref == null || ref === "") continue;
      if (typeof ref !== "string") {
        errors.push(`shot_${index}_asset_reference_invalid:${String(ref)}`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}

function readRecords(value: unknown, field: string, errors: string[]) {
  if (!Array.isArray(value)) {
    errors.push(`${field}_invalid`);
    return [];
  }
  return value.flatMap((item, index) => {
    if (isRecord(item)) return [item];
    errors.push(`${field}_${index}_invalid`);
    return [];
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

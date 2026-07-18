import { saveLegacyDirectorDeskSceneIfEmpty } from "../io/directorDeskApi";
import {
  createDirectorDeskRecord,
  type DirectorDeskRecord,
} from "./directorDeskRegistry";

const REGISTRY_KEYS = [
  "lingxi-3d-director-desk-registry-v1",
  "standalone-3d-director-desk-registry-v1",
] as const;
const LEGACY_SCENE_KEY = "storyai-3d-director-desk-demo";
const LEGACY_SCENE_KEY_PREFIX = `${LEGACY_SCENE_KEY}:`;
const MIGRATION_COMPLETE_KEY = "lingxi-3d-director-desk-postgres-migration-v1";

interface LegacyDirectorDeskRecord {
  id: string;
  name: string;
}

export async function migrateLegacyDirectorDesks(existingRecords: DirectorDeskRecord[]) {
  const storage = getStorageSafe();
  if (!storage || storage.getItem(MIGRATION_COMPLETE_KEY) === "complete") return false;

  const legacyRecords = readLegacyDirectorDeskRecords(storage);
  if (legacyRecords.length === 0) return false;

  const existingIds = new Set(existingRecords.map((record) => record.id));
  for (const record of legacyRecords) {
    if (!existingIds.has(record.id)) {
      await createDirectorDeskRecord(record.name, record.id);
      existingIds.add(record.id);
    }

    const scene = readLegacyScene(storage, record.id);
    if (scene) {
      await saveLegacyDirectorDeskSceneIfEmpty(record.id, scene);
    }
  }

  storage.setItem(MIGRATION_COMPLETE_KEY, "complete");
  return true;
}

function readLegacyDirectorDeskRecords(storage: Storage) {
  const records = new Map<string, LegacyDirectorDeskRecord>();

  for (const key of REGISTRY_KEYS) {
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "null") as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const value of parsed) {
        const record = normalizeLegacyRecord(value);
        if (record && !records.has(record.id)) records.set(record.id, record);
      }
    } catch {
      // Ignore malformed legacy entries and continue migrating valid desks.
    }
  }

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(LEGACY_SCENE_KEY_PREFIX)) continue;
    const id = key.slice(LEGACY_SCENE_KEY_PREFIX.length).trim();
    if (id && id.length <= 100 && !records.has(id)) {
      records.set(id, { id, name: defaultLegacyName(id) });
    }
  }

  if (storage.getItem(LEGACY_SCENE_KEY) && !records.has("desk_1")) {
    records.set("desk_1", { id: "desk_1", name: "导演台 1 号" });
  }

  return [...records.values()];
}

function normalizeLegacyRecord(value: unknown): LegacyDirectorDeskRecord | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { id?: unknown; name?: unknown };
  const id = typeof record.id === "string" ? record.id.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!id || id.length > 100 || !name || name.length > 100) return null;
  return { id, name };
}

function readLegacyScene(storage: Storage, deskId: string) {
  const scoped = storage.getItem(`${LEGACY_SCENE_KEY_PREFIX}${deskId}`);
  const raw = scoped ?? (deskId === "desk_1" ? storage.getItem(LEGACY_SCENE_KEY) : null);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function defaultLegacyName(id: string) {
  const match = id.match(/^desk_(\d+)$/);
  return match ? `导演台 ${Number(match[1])} 号` : id;
}

function getStorageSafe() {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

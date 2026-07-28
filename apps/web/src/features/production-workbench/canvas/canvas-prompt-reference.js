const REFERENCE_ID = "[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9_-])?";
const REFERENCE_TOKEN = new RegExp(`@([a-z][a-z0-9_-]*):(${REFERENCE_ID})(?:@(${REFERENCE_ID}))?`, "g");

const SUPPORTED_REFERENCE_TYPES = new Set([
  "node", "asset", "model", "voice", "drama", "style", "skill", "prompt",
]);

export const CANVAS_PROMPT_EXPANSION_ORDER = [
  "slash_command", "preset", "skill", "style", "reference", "suffix",
];

/**
 * Expand Canvas prompt references against a caller-provided catalog.
 * Catalog records are intentionally plain data so the same shape can be
 * persisted with a run snapshot by the API layer later.
 */
export function resolveCanvasPromptReferences(prompt, catalog = {}, options = {}) {
  const source = String(prompt ?? "");
  const references = [];
  const diagnostics = [];
  const strict = options.strict === true;
  const normalizedCatalog = catalog && typeof catalog === "object" ? catalog : {};
  const state = { count: 0 };
  const expandedPrompt = expandReferenceText(source, normalizedCatalog, references, diagnostics, state, []);

  return {
    sourcePrompt: source,
    expandedPrompt,
    references,
    diagnostics,
    expansionOrder: [...CANVAS_PROMPT_EXPANSION_ORDER],
    ok: strict ? diagnostics.length === 0 : !diagnostics.some((item) => item.code === "reference_forbidden"),
  };
}

function expandReferenceText(source, catalog, references, diagnostics, state, ancestry) {
  return source.replace(REFERENCE_TOKEN, (token, rawType, id, version) => {
    state.count += 1;
    const type = String(rawType ?? "").toLowerCase();
    const reference = { token, type, id: String(id), version: version ? String(version) : null };
    references.push(reference);
    if (state.count > 50) {
      diagnostics.push({ code: "reference_limit_exceeded", ...reference });
      return token;
    }
    if (!SUPPORTED_REFERENCE_TYPES.has(type)) {
      diagnostics.push({ code: "unsupported_reference_type", ...reference });
      return token;
    }

    const cycleKey = `${type}:${reference.id}@${reference.version ?? "current"}`;
    if (ancestry.includes(cycleKey)) {
      diagnostics.push({ code: "reference_cycle", ...reference, path: [...ancestry, cycleKey] });
      return token;
    }

    const record = findRecord(catalog[type], reference.id, reference.version);
    if (!record) {
      diagnostics.push({ code: "reference_not_found", ...reference });
      return token;
    }
    if (record.accessible === false || record.permission === "denied") {
      diagnostics.push({ code: "reference_forbidden", ...reference });
      return token;
    }
    if (record.status && !["active", "ready", "published"].includes(String(record.status).toLowerCase())) {
      diagnostics.push({ code: "reference_unavailable", ...reference, status: record.status });
      return token;
    }
    const value = readReferenceValue(record);
    if (!value) {
      diagnostics.push({ code: "reference_value_missing", ...reference });
      return token;
    }
    return expandReferenceText(value, catalog, references, diagnostics, state, [...ancestry, cycleKey]);
  });
}

export function parseCanvasPromptReferences(prompt) {
  const result = resolveCanvasPromptReferences(prompt, {}, { strict: false });
  return result.references;
}

export function upsertCanvasPromptReference(document, type, record) {
  const normalizedType = String(type ?? "").trim().toLowerCase();
  const id = String(record?.id ?? "").trim();
  if (!SUPPORTED_REFERENCE_TYPES.has(normalizedType) || !id) return document;
  const catalog = document?.promptReferenceCatalog && typeof document.promptReferenceCatalog === "object"
    ? document.promptReferenceCatalog
    : {};
  const collection = catalog[normalizedType] && typeof catalog[normalizedType] === "object"
    ? catalog[normalizedType]
    : {};
  return {
    ...document,
    promptReferenceCatalog: {
      ...catalog,
      [normalizedType]: {
        ...collection,
        [id]: { ...record, id },
      },
    },
  };
}

function findRecord(collection, id, version) {
  if (!collection) return null;
  if (Array.isArray(collection)) {
    return collection.find((item) => {
      if (!item || typeof item !== "object") return false;
      const itemId = String(item.id ?? "");
      if (itemId !== id) return false;
      return !version || String(item.version ?? item.revision ?? "") === version;
    }) ?? null;
  }
  if (typeof collection === "object") {
    const value = collection[id];
    if (value && typeof value === "object" && version && value.versions && typeof value.versions === "object") {
      return value.versions[version] ?? null;
    }
    if (
      value && typeof value === "object" && version &&
      String(value.version ?? value.revision ?? "") !== version
    ) {
      return null;
    }
    return value && typeof value === "object" ? value : null;
  }
  return null;
}

function readReferenceValue(record) {
  if (!record || typeof record !== "object") return "";
  for (const key of ["value", "content", "text", "prompt", "expandedPrompt", "reference"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export const __canvasPromptReferenceTestUtils = {
  findRecord,
  readReferenceValue,
};

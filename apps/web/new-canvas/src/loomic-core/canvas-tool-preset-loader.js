function presetKey(presetId) {
  return String(presetId ?? "").trim();
}

function createDeduplicatedLoader(load) {
  const cache = new Map();
  const pending = new Map();
  const revisions = new Map();

  const get = (presetId) => {
    const key = presetKey(presetId);
    if (!key) return Promise.reject(new Error("tool_preset_id_required"));
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (pending.has(key)) return pending.get(key);
    const revision = revisions.get(key) ?? 0;
    const request = Promise.resolve().then(() => load(key)).then((value) => {
      // A mutation can invalidate an in-flight request. Do not let its stale
      // response repopulate the cache after the mutation has committed.
      if ((revisions.get(key) ?? 0) === revision) cache.set(key, value);
      return value;
    }).finally(() => {
      if (pending.get(key) === request) pending.delete(key);
    });
    pending.set(key, request);
    return request;
  };

  return {
    get,
    seed(presetId, value) {
      const key = presetKey(presetId);
      if (!key) return;
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      pending.delete(key);
      cache.set(key, value);
    },
    remove(presetId) {
      const key = presetKey(presetId);
      if (!key) return;
      revisions.set(key, (revisions.get(key) ?? 0) + 1);
      pending.delete(key);
      cache.delete(key);
    },
  };
}

export function createCanvasToolPresetLazyLoader({ loadDetail, loadVersions }) {
  const details = createDeduplicatedLoader(loadDetail);
  const versions = createDeduplicatedLoader(loadVersions);
  return {
    loadDetail: details.get,
    loadVersions: versions.get,
    seedDetail: details.seed,
    seedVersions: versions.seed,
    invalidateVersions: versions.remove,
    remove(presetId) {
      details.remove(presetId);
      versions.remove(presetId);
    },
  };
}

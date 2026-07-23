export function createCanvasAssetMutationScopeRef() {
  return { current: null };
}

export function updateCanvasAssetMutationScope(scopeRef, identity) {
  const current = scopeRef.current;
  if (!current
    || current.api !== identity.api
    || current.canvasProjectId !== identity.canvasProjectId
    || current.open !== identity.open) {
    scopeRef.current = { ...identity, token: {} };
  }
  return scopeRef.current;
}

export function isCanvasAssetMutationScopeCurrent(scopeRef, token) {
  const current = scopeRef.current;
  return Boolean(current?.open && current.token === token);
}

export function invalidateCanvasAssetMutationScope(scopeRef) {
  if (!scopeRef.current) return;
  scopeRef.current = { ...scopeRef.current, open: false, token: {} };
}

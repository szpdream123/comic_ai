// Used by the shipped canvas assistant tool; model validation and generation stay
// in the existing runtime so provider/workflow compatibility checks still apply.
export function resolveCanvasAssistantModelId(state, kind) {
  const key = kind === "image" ? "assistantImageModelId" : kind === "video" ? "assistantVideoModelId" : null;
  const selected = key && state.config?.[key];
  if (!selected) return undefined;
  return state.config?.generalModels?.some(model => model.id === selected && model.category === kind)
    ? `general/${selected}` : selected;
}

export async function runCanvasAgentBatch(context, nodeIds, store, runNode, resolveModel) {
  const pending = new Set(nodeIds);
  const results = new Map();
  let completedRuns = 0;
  const snapshot = store.getState();
  const dependencies = new Map(nodeIds.map(id => {
    const node = snapshot.nodes.find(node => node.id === id);
    const references = [...String(node?.data?.prompt ?? "").matchAll(/@\{([^:}\r\n]+):[^}\r\n]+\}/g)]
      .map(match => match[1].split("/cell/")[0]);
    return [id, new Set([
      ...(snapshot.edges ?? []).filter(edge => edge.target === id).map(edge => edge.source),
      ...references,
    ].filter(source => pending.has(source)))];
  }));
  const run = async id => {
    if (context.signal.aborted) return;
    const state = store.getState();
    if (state.currentProjectId !== context.projectId) {
      results.set(id, { nodeId: id, status: "aborted", message: "生成期间项目已切换" });
      return;
    }
    const node = state.nodes.find(node => node.id === id);
    if (!node) {
      results.set(id, { nodeId: id, status: "missing" });
      return;
    }
    if (node.data.status === "loading") {
      results.set(id, { nodeId: id, status: "skipped", message: "节点正在生成中" });
      return;
    }
    if ([...dependencies.get(id)].some(source => results.get(source)?.status !== "success")) {
      results.set(id, { nodeId: id, status: "skipped", message: "上游节点尚未生成成功" });
      return;
    }
    try {
      const kind = ["ai-image", "ai-panorama", "ai-animation"].includes(node.data.type) ? "image"
        : node.data.type === "ai-video" ? "video" : null;
      let data;
      const selected = resolveCanvasAssistantModelId(state, kind);
      if (!node.data.model && !node.data.workflowId && selected) {
        const resolved = resolveModel(selected, [node]);
        if (resolved.error) {
          results.set(id, { nodeId: id, status: "failed", message: resolved.error });
          return;
        }
        data = { ...node.data, ...resolved.patch };
      }
      const result = data ? await runNode(id, undefined, undefined, data) : await runNode(id);
      if (store.getState().currentProjectId !== context.projectId) {
        results.set(id, { nodeId: id, status: "aborted", message: "生成期间项目已切换" });
        return;
      }
      completedRuns++;
      results.set(id, { nodeId: id, status: result.success ? "success" : "failed", message: result.message });
    } catch (error) {
      results.set(id, { nodeId: id, status: "failed", message: error instanceof Error ? error.message : "生成失败" });
    }
  };
  while (pending.size) {
    if (context.signal.aborted) throw new DOMException("Aborted", "AbortError");
    const ready = [...pending].filter(id => [...dependencies.get(id)].every(source => !pending.has(source)));
    if (!ready.length) {
      for (const id of pending) results.set(id, { nodeId: id, status: "failed", message: "节点存在循环依赖，请检查连线和提示词引用" });
      break;
    }
    // Only image nodes change to parallel execution; other generation keeps its
    // existing serial behavior, and downstream nodes wait for the current wave.
    const images = ready.filter(id => ["ai-image", "ai-panorama"].includes(store.getState().nodes.find(node => node.id === id)?.data.type));
    const batch = images.length ? images : ready.slice(0, 1);
    await Promise.all(batch.map(run));
    // Active workflow guards capture the revision at start. Advance it only
    // after the entire wave settles so sibling results do not cancel each other.
    if (completedRuns && store.getState().currentProjectId === context.projectId) {
      store.getState().incrementRevision();
      completedRuns = 0;
    }
    batch.forEach(id => pending.delete(id));
  }
  if (context.signal.aborted) throw new DOMException("Aborted", "AbortError");
  return nodeIds.map(id => results.get(id));
}

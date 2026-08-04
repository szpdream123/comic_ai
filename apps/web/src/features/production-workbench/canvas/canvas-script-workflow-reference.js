const UNKNOWN_WORKFLOW_REFERENCE_NAME = /^[\p{L}\p{N}_#-]+/u;
const WORKFLOW_REFERENCE_TOKEN_PATTERN = /(?:【@([^】]+)】|@([^\s【】,，。；;：:=]+))/gu;

export function collectScriptWorkflowVideoReferenceMentions(prompt) {
  const mentions = [];
  const seen = new Set();
  const lines = String(prompt ?? "").replace(/<br\s*\/?>/giu, "\n").split(/\r?\n/u);
  for (const line of lines) {
    const kind = line.includes("视频场景对照表")
      ? "scene"
      : line.includes("视频角色对照表")
        ? "character"
        : line.includes("视频道具对照表")
          ? "prop"
          : "";
    if (!kind) continue;
    for (const match of line.matchAll(WORKFLOW_REFERENCE_TOKEN_PATTERN)) {
      const name = String(match?.[1] ?? match?.[2] ?? "").trim();
      const mention = name ? `@${name}` : "";
      if (!mention || seen.has(mention)) continue;
      seen.add(mention);
      mentions.push({ mention, name, kind });
    }
  }
  return mentions;
}

/**
 * Compile a script-workflow video prompt into model-facing image references.
 * This deliberately has no knowledge of the canvas document: callers provide
 * the persisted workflow bindings so ordinary Canvas prompt handling is left
 * unchanged.
 */
export function compileScriptWorkflowVideoReferences(input = {}) {
  const sourcePrompt = String(input?.prompt ?? "");
  const bindings = normalizeWorkflowReferenceBindings(input?.workflowReferenceBindings);
  const diagnostics = [];
  const orderedNodeIds = [];
  const orderedBindings = [];
  const referenceIndexByNodeId = new Map();

  const bindingNames = [...bindings.keys()].sort((left, right) => right.length - left.length);
  let compiledPrompt = "";
  let cursor = 0;
  for (let offset = sourcePrompt.indexOf("@", cursor); offset >= 0; offset = sourcePrompt.indexOf("@", cursor)) {
    compiledPrompt += sourcePrompt.slice(cursor, offset);
    const tail = sourcePrompt.slice(offset + 1);
    const name = bindingNames.find((candidate) => tail.startsWith(candidate))
      ?? tail.match(UNKNOWN_WORKFLOW_REFERENCE_NAME)?.[0]
      ?? "";
    if (!name) {
      compiledPrompt += "@";
      cursor = offset + 1;
      continue;
    }
    const token = `@${name}`;
    const binding = bindings.get(name);
    const nodeId = readWorkflowReferenceNodeId(binding);
    if (!binding || !nodeId) {
      diagnostics.push({
        code: "script_workflow_reference_binding_missing",
        token,
        name,
        offset: Number(offset),
      });
      compiledPrompt += token;
      cursor = offset + token.length;
      continue;
    }
    let referenceIndex = referenceIndexByNodeId.get(nodeId);
    if (!referenceIndex) {
      referenceIndex = orderedNodeIds.length + 1;
      referenceIndexByNodeId.set(nodeId, referenceIndex);
      orderedNodeIds.push(nodeId);
      orderedBindings.push({
        ...binding,
        mention: `@${name}`,
        nodeId,
        referenceIndex,
      });
    }
    compiledPrompt += `图${referenceIndex}中的${name}`;
    cursor = offset + token.length;
  }
  compiledPrompt += sourcePrompt.slice(cursor);

  return {
    ok: diagnostics.length === 0,
    sourcePrompt,
    compiledPrompt,
    orderedNodeIds,
    orderedBindings,
    diagnostics,
  };
}

function normalizeWorkflowReferenceBindings(value) {
  const entries = Array.isArray(value)
    ? value.map((binding) => [workflowBindingName(binding), binding])
    : value && typeof value === "object"
      ? Object.entries(value)
      : [];
  const bindings = new Map();
  for (const [rawName, rawBinding] of entries) {
    const name = normalizeWorkflowReferenceName(rawName || workflowBindingName(rawBinding));
    if (!name || !rawBinding) continue;
    const binding = typeof rawBinding === "string"
      ? { nodeId: rawBinding }
      : rawBinding && typeof rawBinding === "object" && !Array.isArray(rawBinding)
        ? { ...rawBinding }
        : null;
    if (binding) bindings.set(name, binding);
  }
  return bindings;
}

function workflowBindingName(binding) {
  if (!binding || typeof binding !== "object" || Array.isArray(binding)) return "";
  return String(binding.mention ?? binding.token ?? binding.name ?? binding.label ?? "");
}

function normalizeWorkflowReferenceName(value) {
  return String(value ?? "").trim().replace(/^@/, "");
}

function readWorkflowReferenceNodeId(binding) {
  if (!binding || typeof binding !== "object") return "";
  return String(binding.nodeId ?? binding.assetNodeId ?? binding.sourceNodeId ?? "").trim();
}

import { createWorkflowNodeElement, updateWorkflowNodeElement } from "../loomic-core/workflow-node-elements.js";

export function agentAssetsFromPayload(payload) {
  return Array.isArray(payload?.items) ? payload.items : [];
}

export function prependAgentAsset(current, asset) {
  if (!asset?.id) return current;
  return [asset, ...current.filter((entry) => entry.id !== asset.id)];
}

export function replaceAgentAsset(current, assetId, asset) {
  if (!asset?.id) return current;
  return current.map((entry) => entry.id === assetId ? asset : entry);
}

export function removeAgentAsset(current, assetId) {
  return current.filter((entry) => entry.id !== assetId);
}

export function insertAgentAssetOnCanvas(api, asset) {
  if (!api || !asset?.id) return null;
  const elementId = createWorkflowNodeElement(api, "director-node", {
    title: asset.name,
    instructions: asset.instructions,
  });
  if (!elementId) return null;
  updateWorkflowNodeElement(api, elementId, {
    agentAssetId: asset.id,
    agentAssetName: asset.name,
    agentAssetDescription: asset.description ?? "",
  });
  return elementId;
}

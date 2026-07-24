import { useCanvasToolPreset } from "../loomic-core/canvas-tool-presets.js";

export const CANVAS_EMPTY_QUICKSTARTS = Object.freeze([
  Object.freeze({ id: "story-script", label: "故事脚本生成", presetId: "script-storyboard" }),
  Object.freeze({ id: "character-three-view", label: "角色三视图", presetId: "character-three-view" }),
  Object.freeze({ id: "first-frame-video", label: "首帧图生视频", presetId: "image-to-video" }),
  Object.freeze({ id: "audio-video", label: "音频生视频", presetId: "audio-to-video" }),
]);

export function insertCanvasEmptyQuickstart(api, quickstartId) {
  const quickstart = CANVAS_EMPTY_QUICKSTARTS.find(({ id }) => id === quickstartId);
  if (!api || !quickstart) return { ok: false, reason: "quickstart_not_found", elementIds: [] };
  return useCanvasToolPreset(api, quickstart.presetId);
}

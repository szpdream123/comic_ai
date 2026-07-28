export function resolveEpisodeWorkbenchPrompt(ui = {}, storyboards = []) {
  const scopeMode = ui.museScopeMode ?? "storyboard";
  if (scopeMode === "assets") {
    return String(ui.assetPromptDraft?.prompt ?? ui.prompt ?? "");
  }
  const mediaMode = ui.episodeMediaMode ?? "image";
  const selectedStoryboard =
    storyboards.find((storyboard) => storyboard.id === ui.selectedStoryboardId) ??
    ui.selectedStoryboard ??
    storyboards[0] ??
    null;
  if (isStoryboardPromptClearedForSelection(ui, selectedStoryboard?.id, mediaMode)) {
    return "";
  }
  return String(resolveStoryboardPromptForMode(selectedStoryboard, mediaMode) ?? ui.prompt ?? "");
}

export function isStoryboardPromptClearedForSelection(ui = {}, storyboardId = null, mediaMode = "image") {
  const context = ui.storyboardPromptClearedContext ?? null;
  const selectedStoryboardId = String(storyboardId ?? ui.selectedStoryboardId ?? "").trim();
  const clearedStoryboardId = String(context?.storyboardId ?? "").trim();
  const selectedMediaMode = String(mediaMode ?? ui.episodeMediaMode ?? "image");
  const clearedMediaMode = String(context?.mediaMode ?? "").trim();
  return Boolean(
    selectedStoryboardId &&
      selectedStoryboardId === clearedStoryboardId &&
      selectedMediaMode === clearedMediaMode &&
      String(ui.prompt ?? "") === "",
  );
}

export function resolveStoryboardPromptForMode(storyboard, mediaMode = "image") {
  const generationState = storyboard?.generationState ?? {};
  const hasImagePrompt = Object.prototype.hasOwnProperty.call(generationState, "imagePrompt");
  const hasVideoPrompt = Object.prototype.hasOwnProperty.call(generationState, "videoPrompt");
  if (mediaMode === "video" || mediaMode === "lip-sync") {
    return hasVideoPrompt ? generationState.videoPrompt ?? "" : hasImagePrompt ? "" : generationState.prompt ?? "";
  }
  if (mediaMode === "image") {
    return hasImagePrompt ? generationState.imagePrompt ?? "" : hasVideoPrompt ? "" : generationState.prompt ?? "";
  }
  return generationState.prompt ?? "";
}

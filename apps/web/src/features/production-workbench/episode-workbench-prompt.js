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
  return String(resolveStoryboardPromptForMode(selectedStoryboard, mediaMode) ?? ui.prompt ?? "");
}

export function resolveStoryboardPromptForMode(storyboard, mediaMode = "image") {
  const generationState = storyboard?.generationState ?? {};
  if (mediaMode === "video" || mediaMode === "lip-sync") {
    return generationState.videoPrompt ?? generationState.prompt ?? "";
  }
  if (mediaMode === "image") {
    return generationState.imagePrompt ?? generationState.prompt ?? "";
  }
  return generationState.prompt ?? "";
}

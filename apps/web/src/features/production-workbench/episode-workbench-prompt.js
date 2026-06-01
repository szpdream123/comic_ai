export function resolveEpisodeWorkbenchPrompt(ui = {}, storyboards = []) {
  const scopeMode = ui.museScopeMode ?? "storyboard";
  if (scopeMode === "assets") {
    return String(ui.assetPromptDraft?.prompt ?? ui.prompt ?? "");
  }
  const selectedStoryboard =
    storyboards.find((storyboard) => storyboard.id === ui.selectedStoryboardId) ??
    ui.selectedStoryboard ??
    storyboards[0] ??
    null;
  return String(selectedStoryboard?.generationState?.prompt ?? ui.prompt ?? "");
}

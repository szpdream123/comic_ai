export function buildGenerationProviderPayloadRef(input: {
  targetType?: unknown;
  targetId?: unknown;
  episodeId?: unknown;
  taskId: string;
  mediaType: "image" | "video" | "audio";
}) {
  const targetType = readNonEmptyString(input.targetType) ?? "episode";
  const targetId = readNonEmptyString(input.targetId) ??
    readNonEmptyString(input.episodeId) ??
    input.taskId;
  return `creator://generation/${targetType}/${targetId}/${input.mediaType}/${input.taskId}`;
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

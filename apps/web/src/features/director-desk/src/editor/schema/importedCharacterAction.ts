const IMPORTED_CHARACTER_ACTION_PREFIX = "imported-action:";

export function createImportedCharacterActionId(animationAssetId: string, clipName: string) {
  return `${IMPORTED_CHARACTER_ACTION_PREFIX}${animationAssetId}:${encodeURIComponent(clipName)}`;
}

export function parseImportedCharacterActionId(value: string | null | undefined) {
  if (!value?.startsWith(IMPORTED_CHARACTER_ACTION_PREFIX)) return null;
  const payload = value.slice(IMPORTED_CHARACTER_ACTION_PREFIX.length);
  const separator = payload.indexOf(":");
  if (separator < 1) return null;
  try {
    return {
      animationAssetId: payload.slice(0, separator),
      clipName: decodeURIComponent(payload.slice(separator + 1)),
    };
  } catch {
    return null;
  }
}

export const DIRECTOR_CHARACTER_BONE_PARTS = [
  "body",
  "torso",
  "head",
  "leftShoulder",
  "rightShoulder",
  "leftElbow",
  "rightElbow",
  "leftHand",
  "rightHand",
  "leftHip",
  "rightHip",
  "leftKnee",
  "rightKnee",
  "leftFoot",
  "rightFoot",
] as const;

export type DirectorCharacterBonePart = (typeof DIRECTOR_CHARACTER_BONE_PARTS)[number];
export type DirectorCharacterBoneMap = Partial<Record<DirectorCharacterBonePart, string>>;

export function normalizeDirectorCharacterBoneMap(value: unknown): DirectorCharacterBoneMap {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    DIRECTOR_CHARACTER_BONE_PARTS.flatMap((part) => {
      const boneName = source[part];
      return typeof boneName === "string" && boneName.trim() ? [[part, boneName.trim()]] : [];
    })
  ) as DirectorCharacterBoneMap;
}

export function isCompleteDirectorCharacterBoneMap(value: unknown) {
  const map = normalizeDirectorCharacterBoneMap(value);
  const names = DIRECTOR_CHARACTER_BONE_PARTS.map((part) => map[part]).filter(
    (name): name is string => Boolean(name)
  );
  return names.length === DIRECTOR_CHARACTER_BONE_PARTS.length && new Set(names).size === names.length;
}

export function getSemanticBodyPartForBoneName(value: string): DirectorCharacterBonePart | null {
  const name = value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (/hips|pelvis|root/.test(name)) return "body";
  if (/spine|chest|torso/.test(name)) return "torso";
  if (/head/.test(name)) return "head";
  if (/left.*(forearm|lowerarm)|forearml/.test(name)) return "leftElbow";
  if (/right.*(forearm|lowerarm)|forearmr/.test(name)) return "rightElbow";
  if (/left.*(upper)?arm|leftarm|upperarml/.test(name)) return "leftShoulder";
  if (/right.*(upper)?arm|rightarm|upperarmr/.test(name)) return "rightShoulder";
  if (/left.*hand|handl/.test(name)) return "leftHand";
  if (/right.*hand|handr/.test(name)) return "rightHand";
  if (/(left|l).*?(upleg|thigh|upperleg)|thighl/.test(name)) return "leftHip";
  if (/(right|r).*?(upleg|thigh|upperleg)|thighr/.test(name)) return "rightHip";
  if (/left.*(leg|calf|lowerleg)|calfl/.test(name)) return "leftKnee";
  if (/right.*(leg|calf|lowerleg)|calfr/.test(name)) return "rightKnee";
  if (/left.*foot|footl/.test(name)) return "leftFoot";
  if (/right.*foot|footr/.test(name)) return "rightFoot";
  return null;
}

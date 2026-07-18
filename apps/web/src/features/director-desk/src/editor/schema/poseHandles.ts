export const POSE_JOINT_IDS = [
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

export type PoseJointId = (typeof POSE_JOINT_IDS)[number];

export interface PoseJointDefinition {
  id: PoseJointId;
  label: string;
  hinge: boolean;
}

export const POSE_JOINT_DEFINITIONS: PoseJointDefinition[] = [
  { id: "body", label: "骨盆", hinge: false },
  { id: "torso", label: "躯干", hinge: false },
  { id: "head", label: "头部", hinge: false },
  { id: "leftShoulder", label: "左肩", hinge: false },
  { id: "rightShoulder", label: "右肩", hinge: false },
  { id: "leftElbow", label: "左肘", hinge: true },
  { id: "rightElbow", label: "右肘", hinge: true },
  { id: "leftHand", label: "左手", hinge: false },
  { id: "rightHand", label: "右手", hinge: false },
  { id: "leftHip", label: "左髋", hinge: false },
  { id: "rightHip", label: "右髋", hinge: false },
  { id: "leftKnee", label: "左膝", hinge: true },
  { id: "rightKnee", label: "右膝", hinge: true },
  { id: "leftFoot", label: "左脚", hinge: false },
  { id: "rightFoot", label: "右脚", hinge: false },
];

export const POSE_JOINT_CONNECTIONS: Array<[PoseJointId, PoseJointId]> = [
  ["body", "torso"],
  ["torso", "head"],
  ["torso", "leftShoulder"],
  ["leftShoulder", "leftElbow"],
  ["leftElbow", "leftHand"],
  ["torso", "rightShoulder"],
  ["rightShoulder", "rightElbow"],
  ["rightElbow", "rightHand"],
  ["body", "leftHip"],
  ["leftHip", "leftKnee"],
  ["leftKnee", "leftFoot"],
  ["body", "rightHip"],
  ["rightHip", "rightKnee"],
  ["rightKnee", "rightFoot"],
];

function radians(value: number) {
  return (value * Math.PI) / 180;
}

function degrees(value: number) {
  return Math.round((value * 180 / Math.PI) * 10) / 10;
}

function clampDegrees(value: number) {
  return Math.min(90, Math.max(-90, value));
}

export function getPoseJointRotation(
  jointId: PoseJointId,
  controls: Record<string, number>
): [number, number, number] {
  if (jointId.endsWith("Elbow") || jointId.endsWith("Knee")) {
    return [radians(controls[`${jointId}.bend`] ?? 0), 0, 0];
  }

  if (jointId === "body" || jointId === "torso" || jointId === "head") {
    return [
      radians(controls[`${jointId}.pitch`] ?? 0),
      radians(controls[`${jointId}.yaw`] ?? 0),
      radians(controls[`${jointId}.roll`] ?? 0),
    ];
  }

  if (jointId.endsWith("Shoulder") || jointId.endsWith("Hip")) {
    return [
      radians(controls[`${jointId}.pitch`] ?? 0),
      radians(controls[`${jointId}.twist`] ?? 0),
      radians(controls[`${jointId}.spread`] ?? 0),
    ];
  }

  return [
    radians(controls[`${jointId}.pitch`] ?? 0),
    radians(controls[`${jointId}.twist`] ?? 0),
    radians(controls[`${jointId}.roll`] ?? 0),
  ];
}

export function getPoseJointControlPatch(
  jointId: PoseJointId,
  rotation: [number, number, number]
): Record<string, number> {
  const x = clampDegrees(degrees(rotation[0]));
  const y = clampDegrees(degrees(rotation[1]));
  const z = clampDegrees(degrees(rotation[2]));

  if (jointId.endsWith("Elbow") || jointId.endsWith("Knee")) {
    return { [`${jointId}.bend`]: x };
  }

  if (jointId === "body" || jointId === "torso" || jointId === "head") {
    return {
      [`${jointId}.pitch`]: x,
      [`${jointId}.yaw`]: y,
      [`${jointId}.roll`]: z,
    };
  }

  if (jointId.endsWith("Shoulder") || jointId.endsWith("Hip")) {
    return {
      [`${jointId}.pitch`]: x,
      [`${jointId}.twist`]: y,
      [`${jointId}.spread`]: z,
    };
  }

  return {
    [`${jointId}.pitch`]: x,
    [`${jointId}.twist`]: y,
    [`${jointId}.roll`]: z,
  };
}

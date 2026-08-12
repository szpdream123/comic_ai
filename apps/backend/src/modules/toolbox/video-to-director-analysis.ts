const ACTIONS = new Set(["idle", "walk", "run", "crouch", "side_step_left", "jump", "wave", "dance", "interact", "unknown"]);
const SHOT_SIZES = new Set(["close", "medium", "wide"]);
const CAMERA_MOVES = new Set(["static", "push_in", "pull_out", "pan_left", "pan_right", "track"]);
const POSE_CONTROL_RANGES = new Map<string, [number, number]>([
  ["body.offsetY", [-0.8, 0.8]],
  ["body.pitch", [-45, 45]], ["body.yaw", [-60, 60]], ["body.roll", [-35, 35]],
  ["torso.pitch", [-60, 60]], ["torso.yaw", [-75, 75]], ["torso.roll", [-45, 45]],
  ["head.pitch", [-50, 50]], ["head.yaw", [-80, 80]], ["head.roll", [-40, 40]],
  ["leftShoulder.pitch", [-120, 120]], ["leftShoulder.spread", [-100, 100]], ["leftShoulder.twist", [-100, 100]],
  ["rightShoulder.pitch", [-120, 120]], ["rightShoulder.spread", [-100, 100]], ["rightShoulder.twist", [-100, 100]],
  ["leftElbow.bend", [0, 140]], ["rightElbow.bend", [0, 140]],
  ["leftHand.pitch", [-90, 90]], ["leftHand.roll", [-90, 90]], ["leftHand.twist", [-90, 90]],
  ["rightHand.pitch", [-90, 90]], ["rightHand.roll", [-90, 90]], ["rightHand.twist", [-90, 90]],
  ["leftHip.pitch", [-120, 120]], ["leftHip.spread", [-100, 100]], ["leftHip.twist", [-100, 100]],
  ["rightHip.pitch", [-120, 120]], ["rightHip.spread", [-100, 100]], ["rightHip.twist", [-100, 100]],
  ["leftKnee.bend", [0, 140]], ["rightKnee.bend", [0, 140]],
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized.slice(0, 200) || fallback;
}

function number(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function enumValue(value: unknown, allowed: Set<string>, fallback: string) {
  const normalized = text(value).toLowerCase();
  return allowed.has(normalized) ? normalized : fallback;
}

function sample(value: unknown, durationMs: number) {
  const item = record(value);
  return {
    timeMs: Math.round(number(item.timeMs, 0, 0, durationMs)),
    x: number(item.x, 0.5, 0, 1),
    y: number(item.y, 0.8, 0, 1),
    depth: number(item.depth, 0.5, 0, 1),
  };
}

function poseControls(value: unknown) {
  const input = record(value);
  return Object.fromEntries(Object.entries(input).flatMap(([key, rawValue]) => {
    const range = POSE_CONTROL_RANGES.get(key);
    if (!range || !Number.isFinite(Number(rawValue))) return [];
    return [[key, number(rawValue, 0, range[0], range[1])]];
  }).slice(0, POSE_CONTROL_RANGES.size));
}

function poseSample(value: unknown) {
  const item = record(value);
  const timeMs = Number(item.timeMs);
  return {
    timeMs: Math.round(Number.isFinite(timeMs) ? timeMs : 0),
    confidence: number(item.confidence, 0, 0, 1),
    controls: poseControls(item.controls),
  };
}

export const videoToDirectorInstruction = `你是视频预演分析器。输入是按时间顺序排列的 6 FPS 视频联系表和高清关键帧。请把视频分析为可供 3D 导演台编译的结构化数据，精度目标为中等偏细：保持人物跨镜头 trackId 一致，给出近似屏幕坐标和远近深度；识别动作语义、细微关键姿态、景别、运镜、场景和可见道具。不要输出任意 3D 工程 JSON。

坐标约定：x、y、depth 均为 0 到 1；x 从左到右，y 从上到下，depth 0 为近、1 为远。characters 必须把当前镜头的主角放在第一项，只记录该时间段画面中真实可见的人物。人物 samples 必须包含镜头开始和结束位置；移动、舞蹈或景别变化时，每 500 至 1000 毫秒增加一个位置和 depth 采样，近景人物的 depth 必须明显小于后排人物。相邻镜头中服装、发型和位置连续的同一人物必须沿用原 trackId，不要仅因景别或光线变化新建人物。道具优先使用可匹配导演台模型库的常用中文名称，例如沙发、餐桌、椅子、冰箱、办公桌、电脑、汽车、自行车、路灯、摄影机、急救箱等。modelName 填最接近的模型名称。

动作 action 只能是 idle、walk、run、crouch、side_step_left、jump、wave、dance、interact、unknown。明显随音乐连续摆动、编舞或群舞必须使用 dance，不得降级为 interact。景别 shotSize 只能是 close、medium、wide。运镜 cameraMove 只能是 static、push_in、pull_out、pan_left、pan_right、track。

每个人物用 poseSamples 记录镜头内真正影响表演的关键姿态变化，包含动作开始、幅度峰值和结束；静止且姿态无变化时可以为空。舞蹈人物每 500 至 1000 毫秒或每个明显节拍至少输出一个关键姿态，同时记录上半身和可见腿部动作。角度单位为度，只输出画面中能够可靠判断的 controls。controls 键只能使用 body 的 offsetY/pitch/yaw/roll，torso/head 的 pitch/yaw/roll，左右 shoulder/hip 的 pitch、spread、twist，左右 elbow/knee 的 bend，以及左右 hand 的 pitch、roll、twist。不要猜测被遮挡的关节，不要输出手指关节。

严格只输出一个 JSON 对象，不要 Markdown：
{"summary":"中文摘要","scene":{"name":"场景名","description":"场景说明"},"shots":[{"index":1,"startMs":0,"endMs":3000,"shotSize":"medium","cameraMove":"static","cameraConfidence":0.8,"characters":[{"trackId":"person_1","name":"人物1","action":"dance","confidence":0.8,"samples":[{"timeMs":0,"x":0.3,"y":0.8,"depth":0.2},{"timeMs":1000,"x":0.4,"y":0.8,"depth":0.3},{"timeMs":2000,"x":0.5,"y":0.8,"depth":0.4},{"timeMs":3000,"x":0.6,"y":0.8,"depth":0.5}],"poseSamples":[{"timeMs":800,"confidence":0.85,"controls":{"body.offsetY":-0.1,"head.yaw":18,"rightShoulder.pitch":52,"rightElbow.bend":74,"leftHip.spread":-20,"rightKnee.bend":36}}]}],"props":[{"trackId":"prop_1","name":"沙发","modelName":"沙发","confidence":0.8,"x":0.5,"y":0.8,"depth":0.7}]}],"warnings":[]}`;

export async function completeVideoToDirectorWithProviderStreamRetry<T>(complete: () => Promise<T>): Promise<T> {
  try {
    return await complete();
  } catch (error) {
    const failure = record(error);
    const hasResponseText = String(failure.responseText ?? "").trim().length > 0;
    if (String(failure.message ?? "") !== "provider_stream_error" || hasResponseText || failure.usage) {
      throw error;
    }
    return complete();
  }
}

export function normalizeVideoShotSegments(value: unknown, durationMsValue?: number | null) {
  const durationMs = Math.round(number(durationMsValue, 86_400_000, 1, 86_400_000));
  return records(value).slice(0, 80).map((segment, index) => {
    const startMs = Math.round(number(segment.startMs, index * 3000, 0, Math.max(0, durationMs - 1)));
    return {
      index: index + 1,
      startMs,
      endMs: Math.round(number(segment.endMs, Math.min(durationMs, startMs + 3000), startMs + 1, durationMs)),
      confidence: number(segment.confidence, 0, 0, 1),
    };
  });
}

export function parseVideoToDirectorResult(raw: string, durationMsValue?: number | null) {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    const repaired = repairPrematurelyClosedShots(cleaned, error);
    if (!repaired) throw new Error("video_to_director_result_invalid");
    parsed = repaired;
  }
  const root = record(parsed);
  const durationMs = Math.round(number(durationMsValue, 86_400_000, 1, 86_400_000));
  const shots = records(root.shots).slice(0, 80).map((value, index) => {
    const startMs = Math.round(number(value.startMs, index === 0 ? 0 : index * 3000, 0, Math.max(0, durationMs - 1)));
    const endMs = Math.round(number(value.endMs, Math.min(durationMs, startMs + 3000), startMs + 1, durationMs));
    return {
      index: index + 1,
      startMs,
      endMs,
      shotSize: enumValue(value.shotSize, SHOT_SIZES, "medium"),
      cameraMove: enumValue(value.cameraMove, CAMERA_MOVES, "static"),
      cameraConfidence: number(value.cameraConfidence, 0, 0, 1),
      characters: records(value.characters).slice(0, 20).map((character, characterIndex) => {
        const poseSamples = records(character.poseSamples).slice(0, 32).map(poseSample)
          .filter((entry) => entry.timeMs >= startMs && entry.timeMs <= endMs && Object.keys(entry.controls).length > 0)
          .sort((left, right) => left.timeMs - right.timeMs);
        return {
          trackId: text(character.trackId, `person_${characterIndex + 1}`),
          name: text(character.name, `人物${characterIndex + 1}`),
          action: enumValue(character.action, ACTIONS, "unknown"),
          confidence: number(character.confidence, 0, 0, 1),
          samples: records(character.samples).slice(0, 40).map((entry) => sample(entry, durationMs))
            .filter((entry) => entry.timeMs >= startMs && entry.timeMs <= endMs)
            .sort((left, right) => left.timeMs - right.timeMs),
          ...(poseSamples.length ? { poseSamples } : {}),
        };
      }),
      props: records(value.props).slice(0, 40).map((prop, propIndex) => ({
        trackId: text(prop.trackId, `prop_${index + 1}_${propIndex + 1}`),
        name: text(prop.name, `道具${propIndex + 1}`),
        modelName: text(prop.modelName) || text(prop.name),
        confidence: number(prop.confidence, 0, 0, 1),
        x: number(prop.x, 0.5, 0, 1),
        y: number(prop.y, 0.8, 0, 1),
        depth: number(prop.depth, 0.5, 0, 1),
      })),
    };
  }).sort((left, right) => left.startMs - right.startMs)
    .map((shot, index) => ({ ...shot, index: index + 1 }));

  if (!shots.length) throw new Error("video_to_director_result_empty");
  return {
    summary: text(root.summary),
    scene: {
      name: text(record(root.scene).name, "视频预演场景"),
      description: text(record(root.scene).description),
    },
    shots,
    warnings: Array.isArray(root.warnings) ? root.warnings.map((item) => text(item)).filter(Boolean).slice(0, 30) : [],
  };
}

function repairPrematurelyClosedShots(raw: string, error: unknown): unknown | null {
  const position = Number(String(error instanceof Error ? error.message : error).match(/position\s+(\d+)/i)?.[1]);
  if (!Number.isInteger(position) || position < 2 || raw.slice(position - 2, position + 2) !== "]},{") {
    return null;
  }
  try {
    const completedRoot = JSON.parse(raw.slice(0, position));
    if (!Array.isArray(record(completedRoot).shots)) return null;
    const repaired = JSON.parse(`${raw.slice(0, position - 2)}${raw.slice(position)}`);
    return Array.isArray(record(repaired).shots) ? repaired : null;
  } catch {
    return null;
  }
}

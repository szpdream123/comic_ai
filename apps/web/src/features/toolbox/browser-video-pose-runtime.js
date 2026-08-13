import { PoseLandmarker } from "@mediapipe/tasks-vision";

const MAX_TRACK_GAP_MS = 750;
const MIN_TRACK_MATCH_DISTANCE = 0.065;
const MAX_TRACK_MATCH_DISTANCE = 0.2;
const MAX_TRACK_SCALE_LOG_DELTA = 0.55;
const MIN_VISIBILITY = 0.25;
const CONTROL_VISIBILITY = 0.55;
const L = {
  nose: 0, leftEar: 7, rightEar: 8,
  leftShoulder: 11, rightShoulder: 12, leftElbow: 13, rightElbow: 14,
  leftWrist: 15, rightWrist: 16, leftIndex: 19, rightIndex: 20,
  leftHip: 23, rightHip: 24, leftKnee: 25, rightKnee: 26,
  leftAnkle: 27, rightAnkle: 28, leftHeel: 29, rightHeel: 30,
};

export async function analyzeBrowserPoseTimeline(timelineFrames, options = {}) {
  throwIfAborted(options.signal);
  const modelAssetBuffer = options.modelAssetBuffer instanceof Uint8Array
    ? options.modelAssetBuffer
    : new Uint8Array(options.modelAssetBuffer ?? 0);
  if (!modelAssetBuffer.byteLength || !options.wasmLoaderPath || !options.wasmBinaryPath) {
    throw new Error("本机人物姿态模型资源不完整，请重新加载解析器");
  }
  const landmarker = await PoseLandmarker.createFromOptions({
    wasmLoaderPath: options.wasmLoaderPath,
    wasmBinaryPath: options.wasmBinaryPath,
  }, {
    baseOptions: { modelAssetBuffer },
    runningMode: "VIDEO",
    numPoses: 10,
    minPoseDetectionConfidence: 0.35,
    minPosePresenceConfidence: 0.35,
    minTrackingConfidence: 0.35,
    outputSegmentationMasks: false,
  });
  const frames = [];
  try {
    for (let index = 0; index < timelineFrames.length; index += 1) {
      throwIfAborted(options.signal);
      const frame = timelineFrames[index];
      const response = await fetch(frame.url, { signal: options.signal });
      if (!response.ok) throw new Error("本机人物姿态解析无法读取视频画面");
      const bitmap = await createImageBitmap(await response.blob());
      try {
        const result = landmarker.detectForVideo(bitmap, Number(frame.timestampMs) || index);
        frames.push({ timestampMs: Number(frame.timestampMs) || 0, detections: normalizePoseDetections(result) });
      } finally {
        bitmap.close?.();
      }
      options.onProgress?.({
        progress: Math.round(((index + 1) / Math.max(1, timelineFrames.length)) * 100),
        stage: "tracking_people",
      });
    }
  } finally {
    landmarker.close();
  }
  return buildBrowserPoseAnalysis(frames, options.durationMs);
}

function normalizePoseDetections(result) {
  const landmarks = Array.isArray(result?.landmarks) ? result.landmarks : [];
  const worldLandmarks = Array.isArray(result?.worldLandmarks) ? result.worldLandmarks : [];
  return landmarks.flatMap((pose, index) => {
    if (!Array.isArray(pose) || pose.length < 29) return [];
    const detection = poseDetection(pose, Array.isArray(worldLandmarks[index]) ? worldLandmarks[index] : []);
    return detection.confidence >= 0.2 ? [detection] : [];
  });
}

export function buildBrowserPoseAnalysis(frames, durationMsValue) {
  const orderedFrames = [...(Array.isArray(frames) ? frames : [])]
    .sort((left, right) => Number(left.timestampMs) - Number(right.timestampMs));
  const tracks = [];
  let nextTrackNumber = 1;
  orderedFrames.forEach((frame) => {
    const timestampMs = Math.max(0, Math.round(Number(frame.timestampMs) || 0));
    const detections = (Array.isArray(frame.detections) ? frame.detections : []).map(normalizeDetection);
    const activeTracks = tracks.filter((track) => timestampMs - track.lastTimestampMs <= MAX_TRACK_GAP_MS);
    const candidates = [];
    activeTracks.forEach((track) => detections.forEach((detection, detectionIndex) => {
      const elapsedMs = Math.max(1, timestampMs - track.lastTimestampMs);
      const predictedAnchor = predictTrackAnchor(track, elapsedMs);
      const positionDistance = Math.hypot(predictedAnchor.x - detection.anchor.x, predictedAnchor.y - detection.anchor.y);
      const positionAllowance = clamp(
        track.lastHeight * 0.14 + elapsedMs * 0.00016,
        MIN_TRACK_MATCH_DISTANCE,
        MAX_TRACK_MATCH_DISTANCE,
      );
      const scaleDistance = Math.abs(Math.log(Math.max(0.01, detection.height) / Math.max(0.01, track.lastHeight)));
      const scaleAllowance = clamp(0.22 + elapsedMs * 0.0005, 0.28, MAX_TRACK_SCALE_LOG_DELTA);
      if (positionDistance > positionAllowance || scaleDistance > scaleAllowance) return;
      const cost = positionDistance / positionAllowance * 0.75 + scaleDistance / scaleAllowance * 0.25;
      if (cost <= 1) candidates.push({ track, detectionIndex, cost });
    }));
    candidates.sort((left, right) => left.cost - right.cost);
    const assignedTracks = new Set();
    const assignedDetections = new Set();
    candidates.forEach(({ track, detectionIndex }) => {
      if (assignedTracks.has(track.trackId) || assignedDetections.has(detectionIndex)) return;
      appendTrackSample(track, detections[detectionIndex], timestampMs);
      assignedTracks.add(track.trackId);
      assignedDetections.add(detectionIndex);
    });
    detections.forEach((detection, detectionIndex) => {
      if (assignedDetections.has(detectionIndex)) return;
      const track = {
        trackId: `local_person_${nextTrackNumber++}`,
        samples: [], lastTimestampMs: timestampMs,
        lastAnchor: detection.anchor, lastHeight: detection.height,
        velocity: { x: 0, y: 0 },
      };
      appendTrackSample(track, detection, timestampMs);
      tracks.push(track);
    });
  });
  const durationMs = Math.max(1, Number(durationMsValue) || 0, Number(orderedFrames.at(-1)?.timestampMs) || 0);
  const usableTracks = tracks.filter((track) => track.samples.length >= 2)
    .map((track) => finalizeTrack(track, durationMs))
    .sort((left, right) => right.primaryScore - left.primaryScore)
    .map((track, index) => ({ ...track, isPrimary: index === 0 }));
  return { version: 1, frameRate: estimateFrameRate(orderedFrames), durationMs, tracks: usableTracks };
}

function predictTrackAnchor(track, elapsedMs) {
  const velocity = track.velocity ?? { x: 0, y: 0 };
  const predictedOffsetX = clamp(Number(velocity.x) * elapsedMs, -0.12, 0.12);
  const predictedOffsetY = clamp(Number(velocity.y) * elapsedMs, -0.12, 0.12);
  return {
    x: clamp(track.lastAnchor.x + predictedOffsetX),
    y: clamp(track.lastAnchor.y + predictedOffsetY),
  };
}

function appendTrackSample(track, detection, timeMs) {
  const elapsedMs = Math.max(1, timeMs - track.lastTimestampMs);
  const observedVelocity = {
    x: (detection.anchor.x - track.lastAnchor.x) / elapsedMs,
    y: (detection.anchor.y - track.lastAnchor.y) / elapsedMs,
  };
  const previousVelocity = track.velocity ?? { x: 0, y: 0 };
  const previousControls = track.samples.at(-1)?.controls ?? {};
  track.samples.push({
    timeMs,
    x: clamp(detection.anchor.x),
    y: clamp(detection.footY),
    depth: clamp(1 - detection.height * 1.15, 0.05, 0.95),
    confidence: clamp(detection.confidence),
    bbox: detection.bbox,
    controls: smoothPoseControls(previousControls, detection.controls),
  });
  track.velocity = {
    x: previousVelocity.x * 0.45 + observedVelocity.x * 0.55,
    y: previousVelocity.y * 0.45 + observedVelocity.y * 0.55,
  };
  track.lastTimestampMs = timeMs;
  track.lastAnchor = detection.anchor;
  track.lastHeight = detection.height;
}

function smoothPoseControls(previous, current) {
  const controls = {};
  Object.entries(current ?? {}).forEach(([key, value]) => {
    const next = Number(value);
    if (!Number.isFinite(next)) return;
    const before = Number(previous?.[key]);
    if (!Number.isFinite(before)) {
      controls[key] = next;
      return;
    }
    const maxStep = key.endsWith(".bend") ? 38 : 28;
    const limited = clamp(next, before - maxStep, before + maxStep);
    controls[key] = Number((before * 0.35 + limited * 0.65).toFixed(2));
  });
  return controls;
}

function finalizeTrack(track, durationMs) {
  const samples = track.samples;
  const durationScore = clamp((samples.at(-1).timeMs - samples[0].timeMs) / durationMs);
  const areaScore = average(samples.map((sample) => {
    const [left, top, right, bottom] = sample.bbox;
    return clamp((right - left) * (bottom - top) * 4);
  }));
  const centerScore = average(samples.map((sample) => clamp(1 - Math.abs(sample.x - 0.5) * 1.8)));
  const confidenceScore = average(samples.map((sample) => sample.confidence));
  return {
    trackId: track.trackId,
    primaryScore: Number((durationScore * 0.38 + areaScore * 0.34 + centerScore * 0.18 + confidenceScore * 0.1).toFixed(4)),
    firstSeenMs: samples[0].timeMs,
    lastSeenMs: samples.at(-1).timeMs,
    samples,
  };
}

function poseDetection(landmarks, worldLandmarks) {
  const visible = landmarks.filter((landmark) => visibility(landmark) >= MIN_VISIBILITY);
  const xs = visible.map((landmark) => clamp(landmark.x));
  const ys = visible.map((landmark) => clamp(landmark.y));
  const left = xs.length ? Math.min(...xs) : 0.5;
  const right = xs.length ? Math.max(...xs) : 0.5;
  const top = ys.length ? Math.min(...ys) : 0.5;
  const bottom = ys.length ? Math.max(...ys) : 0.5;
  const hip = midpoint(landmarks[L.leftHip], landmarks[L.rightHip]) ?? { x: (left + right) / 2, y: (top + bottom) / 2 };
  const feet = [landmarks[L.leftAnkle], landmarks[L.rightAnkle], landmarks[L.leftHeel], landmarks[L.rightHeel]]
    .filter((landmark) => visibility(landmark) >= MIN_VISIBILITY);
  const confidence = average([
    L.leftShoulder, L.rightShoulder, L.leftHip, L.rightHip,
    L.leftKnee, L.rightKnee, L.leftAnkle, L.rightAnkle,
  ].map((index) => visibility(landmarks[index])));
  return {
    anchor: { x: clamp(hip.x), y: clamp(hip.y) },
    footY: feet.length ? Math.max(...feet.map((landmark) => clamp(landmark.y))) : bottom,
    bbox: [left, top, right, bottom], height: Math.max(0.01, bottom - top), confidence,
    controls: poseControlsFromLandmarks(landmarks, worldLandmarks),
  };
}

export function poseControlsFromLandmarks(landmarks, worldLandmarks = []) {
  const controls = {};
  const add = (key, value, min, max) => {
    if (Number.isFinite(value)) controls[key] = Number(clamp(value, min, max).toFixed(2));
  };
  const point = (index) => visibility(landmarks[index]) >= CONTROL_VISIBILITY ? landmarks[index] : null;
  const world = (index) => worldLandmarks[index] && visibility(landmarks[index]) >= CONTROL_VISIBILITY ? worldLandmarks[index] : null;
  const leftShoulder = point(L.leftShoulder);
  const rightShoulder = point(L.rightShoulder);
  const leftHip = point(L.leftHip);
  const rightHip = point(L.rightHip);
  const shoulderCenter = midpoint(leftShoulder, rightShoulder);
  const hipCenter = midpoint(leftHip, rightHip);
  const torsoLength = shoulderCenter && hipCenter ? Math.hypot(
    shoulderCenter.x - hipCenter.x,
    shoulderCenter.y - hipCenter.y,
  ) : 0;
  const shoulderRoll = leftShoulder && rightShoulder
    ? horizontalTilt(leftShoulder, rightShoulder, torsoLength * 0.25)
    : null;
  if (leftShoulder && rightShoulder) {
    const nose = point(L.nose);
    if (shoulderCenter && nose && shoulderRoll !== null) {
      const shoulderWidth = Math.max(0.02, Math.abs(rightShoulder.x - leftShoulder.x));
      add("head.yaw", ((nose.x - shoulderCenter.x) / shoulderWidth) * 30, -45, 45);
    }
    const leftEar = point(L.leftEar);
    const rightEar = point(L.rightEar);
    const headRoll = leftEar && rightEar
      ? horizontalTilt(leftEar, rightEar, Math.abs(rightShoulder.x - leftShoulder.x) * 0.2)
      : null;
    if (headRoll !== null && shoulderRoll !== null) add("head.roll", headRoll - shoulderRoll, -25, 25);
  }
  const hipRoll = leftHip && rightHip
    ? horizontalTilt(leftHip, rightHip, torsoLength * 0.15)
    : null;
  if (hipRoll !== null) add("body.roll", hipRoll, -25, 25);
  if (shoulderRoll !== null) add("torso.roll", shoulderRoll - (hipRoll ?? 0), -25, 25);
  const worldShoulders = midpoint(world(L.leftShoulder), world(L.rightShoulder));
  const worldHips = midpoint(world(L.leftHip), world(L.rightHip));
  if (worldShoulders && worldHips) {
    add("body.pitch", degrees(Math.atan2(worldShoulders.z - worldHips.z, Math.abs(worldShoulders.y - worldHips.y))), -30, 30);
  }
  addLimbControls(controls, "left", landmarks, worldLandmarks);
  addLimbControls(controls, "right", landmarks, worldLandmarks);
  return controls;
}

function addLimbControls(controls, side, landmarks, worldLandmarks) {
  const i = side === "left"
    ? { shoulder: 11, elbow: 13, wrist: 15, index: 19, hip: 23, knee: 25, ankle: 27 }
    : { shoulder: 12, elbow: 14, wrist: 16, index: 20, hip: 24, knee: 26, ankle: 28 };
  const visible = (...keys) => keys.every((key) => visibility(landmarks[i[key]]) >= CONTROL_VISIBILITY);
  if (visible("shoulder", "elbow")) {
    controls[`${side}Shoulder.spread`] = roundControl(degrees(Math.atan2(
      landmarks[i.elbow].x - landmarks[i.shoulder].x,
      landmarks[i.elbow].y - landmarks[i.shoulder].y,
    )), -90, 90);
    const shoulderWorld = worldLandmarks[i.shoulder];
    const elbowWorld = worldLandmarks[i.elbow];
    if (shoulderWorld && elbowWorld) controls[`${side}Shoulder.pitch`] = roundControl(degrees(Math.atan2(
      -(elbowWorld.z - shoulderWorld.z),
      Math.hypot(elbowWorld.x - shoulderWorld.x, elbowWorld.y - shoulderWorld.y),
    )), -75, 75);
  }
  if (visible("shoulder", "elbow", "wrist")) {
    controls[`${side}Elbow.bend`] = roundControl(jointBend(landmarks[i.shoulder], landmarks[i.elbow], landmarks[i.wrist]), 0, 140);
  }
  if (visible("hip", "knee")) {
    controls[`${side}Hip.spread`] = roundControl(degrees(Math.atan2(
      landmarks[i.knee].x - landmarks[i.hip].x,
      landmarks[i.knee].y - landmarks[i.hip].y,
    )), -75, 75);
    const hipWorld = worldLandmarks[i.hip];
    const kneeWorld = worldLandmarks[i.knee];
    if (hipWorld && kneeWorld) controls[`${side}Hip.pitch`] = roundControl(degrees(Math.atan2(
      -(kneeWorld.z - hipWorld.z), Math.hypot(kneeWorld.x - hipWorld.x, kneeWorld.y - hipWorld.y),
    )), -75, 75);
  }
  if (visible("hip", "knee", "ankle")) {
    controls[`${side}Knee.bend`] = roundControl(jointBend(landmarks[i.hip], landmarks[i.knee], landmarks[i.ankle]), 0, 140);
  }
  if (visible("elbow", "wrist", "index")) {
    const forearmAngle = Math.atan2(
      landmarks[i.wrist].y - landmarks[i.elbow].y,
      landmarks[i.wrist].x - landmarks[i.elbow].x,
    );
    const handAngle = Math.atan2(
      landmarks[i.index].y - landmarks[i.wrist].y,
      landmarks[i.index].x - landmarks[i.wrist].x,
    );
    controls[`${side}Hand.roll`] = roundControl(normalizeDegrees(degrees(handAngle - forearmAngle)), -45, 45);
  }
}

function horizontalTilt(left, right, minimumWidth = 0) {
  const width = Math.abs(Number(right.x) - Number(left.x));
  if (width < minimumWidth) return null;
  return degrees(Math.atan2(Number(right.y) - Number(left.y), width));
}

function normalizeDegrees(value) {
  let normalized = value;
  while (normalized > 180) normalized -= 360;
  while (normalized < -180) normalized += 360;
  return normalized;
}

function normalizeDetection(value) {
  const bbox = Array.isArray(value?.bbox) && value.bbox.length === 4 ? value.bbox.map((item) => clamp(item)) : [0.5, 0.5, 0.5, 0.5];
  return {
    anchor: { x: clamp(value?.anchor?.x), y: clamp(value?.anchor?.y) },
    footY: clamp(value?.footY), bbox,
    height: Math.max(0.01, Number(value?.height) || bbox[3] - bbox[1]),
    confidence: clamp(value?.confidence),
    controls: value?.controls && typeof value.controls === "object" ? { ...value.controls } : {},
  };
}

function jointBend(start, joint, end) {
  const first = { x: start.x - joint.x, y: start.y - joint.y };
  const second = { x: end.x - joint.x, y: end.y - joint.y };
  const denominator = Math.max(0.000001, Math.hypot(first.x, first.y) * Math.hypot(second.x, second.y));
  return 180 - degrees(Math.acos(clamp((first.x * second.x + first.y * second.y) / denominator, -1, 1)));
}

function midpoint(left, right) {
  if (!left || !right) return null;
  return { x: (Number(left.x) + Number(right.x)) / 2, y: (Number(left.y) + Number(right.y)) / 2, z: (Number(left.z) + Number(right.z)) / 2 };
}

function visibility(landmark) {
  const value = Number(landmark?.visibility ?? landmark?.presence ?? (landmark ? 1 : 0));
  return Number.isFinite(value) ? clamp(value) : 0;
}

function estimateFrameRate(frames) {
  const intervals = frames.slice(1).map((frame, index) => Number(frame.timestampMs) - Number(frames[index].timestampMs)).filter((value) => value > 0);
  return intervals.length ? Number((1000 / average(intervals)).toFixed(3)) : 0;
}

function roundControl(value, min, max) { return Number(clamp(value, min, max).toFixed(2)); }
function average(values) { return values.length ? values.reduce((total, value) => total + Number(value || 0), 0) / values.length : 0; }
function degrees(radians) { return radians * 180 / Math.PI; }
function clamp(value, min = 0, max = 1) { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min; }
function throwIfAborted(signal) { if (signal?.aborted) { const error = new Error("视频分析已取消"); error.name = "AbortError"; throw error; } }

export const __browserVideoPoseTestUtils = { normalizePoseDetections, poseDetection };

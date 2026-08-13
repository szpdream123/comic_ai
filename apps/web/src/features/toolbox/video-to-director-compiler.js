const ACTION_PRESETS = {
  walk: "walk-cycle",
  run: "run-cycle",
  crouch: "crouch-cycle",
  side_step_left: "side-step-left",
  jump: "jump-cycle",
  wave: "wave-cycle",
  dance: "dance-cycle",
};

const MODEL_PROPS = [
  ["沙发", "sofa_modern_low.fbx"], ["餐桌", "dining_table_low.fbx"], ["餐椅", "dining_chair_low.fbx"],
  ["椅子", "dining_chair_low.fbx"], ["冰箱", "refrigerator_modern_low.fbx"], ["双人床", "bed_double_low.fbx"],
  ["床", "bed_double_low.fbx"], ["书架", "bookshelf_low.fbx"], ["电视机", "television_low.fbx"],
  ["电视", "television_low.fbx"], ["茶几", "coffee_table_low.fbx"], ["办公桌", "office_desk_low.fbx"],
  ["办公椅", "office_chair_low.fbx"], ["台式电脑", "desktop_computer_low.fbx"], ["电脑", "desktop_computer_low.fbx"],
  ["自动售货机", "vending_machine_low.fbx"], ["咖啡机", "coffee_machine_low.fbx"], ["轮椅", "wheelchair_low.fbx"],
  ["急救箱", "first_aid_kit_low.fbx"], ["灭火器", "fire_extinguisher_low.fbx"], ["电影摄影机", "cinema_camera_low.fbx"],
  ["摄影机", "cinema_camera_low.fbx"], ["摄影灯", "studio_light_low.fbx"], ["场记板", "clapperboard_low.fbx"],
  ["公园长椅", "park_bench_low.fbx"], ["交通信号灯", "traffic_light_low.fbx"], ["路灯", "street_lamp_low.fbx"],
  ["家用轿车", "sedan_low.fbx"], ["轿车", "sedan_low.fbx"], ["汽车", "sedan_low.fbx"],
  ["公交车", "city_bus_low.fbx"], ["自行车", "bicycle_city_low.fbx"], ["摩托车", "motorcycle_low.fbx"],
  ["背包", "backpack_low.fbx"], ["扳手", "wrench_low.fbx"], ["垃圾桶", "trash_sorting_low.fbx"],
  ["门", "door_single_low.fbx"], ["窗户", "window_wall_low.fbx"], ["楼梯", "stairs_low.fbx"],
];

const PRIMARY_CHARACTER_COLOR = "#E0524D";
const SECONDARY_CHARACTER_COLOR = "#FFFFFF";
const LOCAL_TRACK_MAX_INTERPOLATION_GAP_MS = 500;
const STATIONARY_ROOT_MAX_SCREEN_DELTA = 0.08;

function clamp(value, min = 0, max = 1) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
}

function transform(position, rotation = [0, 0, 0], scale = [1, 1, 1]) {
  return { position, rotation, scale };
}

function worldPosition(sample = {}) {
  return [Number(((clamp(sample.x) - 0.5) * 8).toFixed(4)), 0, Number((2 + (1 - clamp(sample.depth)) * 6).toFixed(4))];
}

function interpolateCharacterSample(samples, timeMs) {
  const ordered = [...samples].sort((left, right) => Number(left.timeMs) - Number(right.timeMs));
  if (timeMs <= Number(ordered[0].timeMs)) return ordered[0];
  if (timeMs >= Number(ordered.at(-1).timeMs)) return ordered.at(-1);
  const endIndex = ordered.findIndex((sample) => Number(sample.timeMs) >= timeMs);
  const start = ordered[endIndex - 1];
  const end = ordered[endIndex];
  const progress = clamp((timeMs - Number(start.timeMs)) / Math.max(1, Number(end.timeMs) - Number(start.timeMs)));
  return {
    timeMs,
    x: Number(start.x) + (Number(end.x) - Number(start.x)) * progress,
    y: Number(start.y) + (Number(end.y) - Number(start.y)) * progress,
    depth: Number(start.depth) + (Number(end.depth) - Number(start.depth)) * progress,
  };
}

function normalizeName(value) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN").replace(/[\s_-]+/g, "");
}

export function matchDirectorPropModel(name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;
  const match = MODEL_PROPS.find(([label]) => normalized.includes(normalizeName(label)) || normalizeName(label).includes(normalized));
  if (!match) return null;
  return { name: match[0], fileName: match[1], url: `builtin://life/${match[1]}` };
}

function cameraFov(shotSize) {
  return shotSize === "close" ? 35 : shotSize === "wide" ? 65 : 50;
}

function cameraFrame(shot, sample, shotProgress, subjects = []) {
  const subjectPositions = subjects.length ? subjects.map(worldPosition) : [worldPosition(sample)];
  const subjectCount = subjectPositions.length;
  const baseFov = cameraFov(shot.shotSize);
  const fov = subjectCount >= 3 ? Math.max(baseFov, 60) : subjectCount === 2 ? Math.max(baseFov, 50) : baseFov;
  const baseDistance = shot.shotSize === "close" ? 5 : shot.shotSize === "wide" ? 10 : 7;
  const xs = subjectPositions.map((position) => position[0]);
  const zs = subjectPositions.map((position) => position[2]);
  const target = [
    (Math.min(...xs) + Math.max(...xs)) / 2,
    0,
    (Math.min(...zs) + Math.max(...zs)) / 2,
  ];
  target[1] = 1.2;
  const horizontalFov = 2 * Math.atan(Math.tan((fov * Math.PI / 180) / 2) * (16 / 9));
  const groupDistance = ((Math.max(...xs) - Math.min(...xs)) / 2) / Math.max(0.01, Math.tan(horizontalFov / 2)) * 1.35;
  const nearestDepthOffset = Math.max(...zs) - target[2];
  const distance = Math.max(
    baseDistance * (0.5 + 0.8 * clamp(sample.depth)),
    groupDistance + nearestDepthOffset,
  );
  const position = [target[0], Math.max(2.2, target[1] + 2.2), target[2] + distance];
  if (shot.cameraMove === "push_in") position[2] -= 2 * shotProgress;
  if (shot.cameraMove === "pull_out") position[2] += 2 * shotProgress;
  if (shot.cameraMove === "pan_left") position[0] -= 2 * shotProgress;
  if (shot.cameraMove === "pan_right") position[0] += 2 * shotProgress;
  return { position, target, fov };
}

function cameraSamples(shot, primary) {
  const startMs = Number(shot.startMs) || 0;
  const endMs = Math.max(startMs, Number(shot.endMs) || startMs);
  const samples = Array.isArray(primary?.samples) && primary.samples.length
    ? [...primary.samples].sort((left, right) => Number(left.timeMs) - Number(right.timeMs))
    : [{ timeMs: startMs, x: 0.5, depth: 0.5 }, { timeMs: endMs, x: 0.5, depth: 0.5 }];
  const sampleTimes = new Set([startMs, endMs]);
  (Array.isArray(shot.characters) ? shot.characters : []).forEach((character) => {
    (Array.isArray(character.samples) ? character.samples : []).forEach((sample) => {
      const timeMs = Number(sample.timeMs);
      if (Number.isFinite(timeMs) && timeMs >= startMs && timeMs <= endMs) sampleTimes.add(timeMs);
    });
  });
  return [...sampleTimes].sort((left, right) => left - right)
    .map((timeMs) => ({ ...interpolateCharacterSample(samples, timeMs), timeMs }));
}

function cameraSubjects(shot, timeMs) {
  return (Array.isArray(shot.characters) ? shot.characters : []).flatMap((character) => {
    const samples = Array.isArray(character.samples) ? character.samples : [];
    if (!samples.length) return [];
    return [{ ...interpolateCharacterSample(samples, timeMs), timeMs }];
  });
}

function characterScreenPosition(character, fallbackTimeMs) {
  const samples = Array.isArray(character?.samples) ? character.samples : [];
  const sample = samples[0] ?? { timeMs: fallbackTimeMs, x: 0.5, depth: 0.5 };
  return [clamp(sample.x), clamp(sample.depth)];
}

function screenDistance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1]);
}

function localSampleAt(samples, timeMs) {
  if (!samples.length) return null;
  const ordered = [...samples].sort((left, right) => Number(left.timeMs) - Number(right.timeMs));
  if (timeMs > Number(ordered[0].timeMs) && timeMs < Number(ordered.at(-1).timeMs)) {
    const endIndex = ordered.findIndex((sample) => Number(sample.timeMs) >= timeMs);
    const start = ordered[endIndex - 1];
    const end = ordered[endIndex];
    if (Number(end.timeMs) - Number(start.timeMs) > LOCAL_TRACK_MAX_INTERPOLATION_GAP_MS) return null;
  }
  return interpolateCharacterSample(samples, timeMs);
}

function localTrackScoreInShot(samples, startMs, endMs, fallbackScore) {
  const shotDuration = Math.max(1, endMs - startMs);
  const shotSamples = samples.filter((sample) => Number(sample.timeMs) >= startMs && Number(sample.timeMs) <= endMs);
  if (!shotSamples.length) return 0;
  const visibleDuration = Math.max(0, Math.min(endMs, Number(samples.at(-1)?.timeMs))
    - Math.max(startMs, Number(samples[0]?.timeMs)));
  const averageValue = (values) => values.length
    ? values.reduce((total, value) => total + Number(value || 0), 0) / values.length
    : 0;
  const areaScore = averageValue(shotSamples.map((sample) => {
    const [left, top, right, bottom] = Array.isArray(sample.bbox) ? sample.bbox : [0.5, 0.5, 0.5, 0.5];
    return clamp((Number(right) - Number(left)) * (Number(bottom) - Number(top)) * 4);
  }));
  const centerScore = averageValue(shotSamples.map((sample) => clamp(1 - Math.abs(Number(sample.x) - 0.5) * 1.8)));
  return (visibleDuration / shotDuration) * 0.5
    + areaScore * 0.3
    + centerScore * 0.15
    + clamp(fallbackScore) * 0.05;
}

function enrichShotsWithLocalPose(shots, poseAnalysis) {
  const tracks = Array.isArray(poseAnalysis?.tracks) ? poseAnalysis.tracks : [];
  if (!tracks.length) return shots;
  const hasModelCharacters = shots.some((shot) => Array.isArray(shot.characters) && shot.characters.length > 0);
  const enrichedShots = shots.map((shot) => {
    const startMs = Number(shot.startMs) || 0;
    const endMs = Math.max(startMs + 1, Number(shot.endMs) || startMs + 1);
    const midpointMs = (startMs + endMs) / 2;
    const modelCharacters = Array.isArray(shot.characters) ? shot.characters : [];
    const assignedModelIndexes = new Set();
    const rankedTracks = tracks.map((track, trackIndex) => ({ track, trackIndex }))
      .sort((left, right) => localTrackScoreInShot(right.track.samples ?? [], startMs, endMs, right.track.primaryScore)
        - localTrackScoreInShot(left.track.samples ?? [], startMs, endMs, left.track.primaryScore));
    const localCharacters = rankedTracks.flatMap(({ track, trackIndex }) => {
      const allSamples = Array.isArray(track?.samples) ? track.samples : [];
      if (!allSamples.length || Number(track.lastSeenMs) < startMs || Number(track.firstSeenMs) > endMs) return [];
      const actualSamples = allSamples.filter((sample) => Number(sample.timeMs) >= startMs && Number(sample.timeMs) <= endMs);
      if (!actualSamples.length) return [];
      const startSample = localSampleAt(allSamples, startMs);
      const endSample = localSampleAt(allSamples, endMs);
      const samples = [
        ...(startSample && Number(track.firstSeenMs) <= startMs ? [{ ...startSample, timeMs: startMs }] : []),
        ...actualSamples,
        ...(endSample && Number(track.lastSeenMs) >= endMs ? [{ ...endSample, timeMs: endMs }] : []),
      ].sort((left, right) => Number(left.timeMs) - Number(right.timeMs))
        .reduce((result, sample) => {
          if (result.at(-1)?.timeMs === sample.timeMs) result[result.length - 1] = sample;
          else result.push(sample);
          return result;
        }, []);
      if (!samples.length) return [];
      const localMidpoint = localSampleAt(allSamples, midpointMs) ?? samples[Math.floor(samples.length / 2)];
      const match = modelCharacters.map((character, modelIndex) => {
        if (assignedModelIndexes.has(modelIndex)) return null;
        const modelSamples = Array.isArray(character.samples) ? character.samples : [];
        const modelMidpoint = modelSamples.length ? interpolateCharacterSample(modelSamples, midpointMs) : null;
        if (!modelMidpoint) return null;
        return {
          character,
          modelIndex,
          distance: Math.abs(Number(modelMidpoint.x) - Number(localMidpoint.x))
            + Math.abs(Number(modelMidpoint.depth) - Number(localMidpoint.depth)) * 0.25,
        };
      }).filter(Boolean).sort((left, right) => left.distance - right.distance)[0];
      const matchedCharacter = match?.distance <= 0.45 ? match.character : null;
      if (matchedCharacter) assignedModelIndexes.add(match.modelIndex);
      const poseSamples = actualSamples.flatMap((sample) => (
        sample.controls && Object.keys(sample.controls).length
          ? [{ timeMs: Number(sample.timeMs) || 0, confidence: Number(sample.confidence) || 0, controls: { ...sample.controls } }]
          : []
      ));
      return [{
        trackId: String(matchedCharacter?.trackId || track.trackId || `local_person_${trackIndex + 1}`),
        localTrackId: String(track.trackId || `local_person_${trackIndex + 1}`),
        name: String(matchedCharacter?.name || `人物${trackIndex + 1}`),
        action: matchedCharacter?.action || "unknown",
        confidence: Math.max(Number(matchedCharacter?.confidence) || 0, Number(track.primaryScore) || 0),
        samples: samples.map((sample) => ({
          timeMs: Number(sample.timeMs) || 0,
          x: clamp(sample.x),
          y: clamp(sample.y),
          depth: clamp(sample.depth),
        })),
        ...(poseSamples.length ? { poseSamples } : {}),
        matchedModelIndex: matchedCharacter ? match.modelIndex : null,
        localPrimaryScore: localTrackScoreInShot(samples, startMs, endMs, track.primaryScore),
        localPoseTrack: true,
      }];
    });
    return { shot, modelCharacters, localCharacters };
  });
  return enrichedShots.map(({ shot, modelCharacters, localCharacters }) => {
    const startMs = Number(shot.startMs) || 0;
    const endMs = Math.max(startMs + 1, Number(shot.endMs) || startMs + 1);
    if (!localCharacters.length) return { ...shot, characters: modelCharacters };
    if (!modelCharacters.length) {
      return { ...shot, characters: hasModelCharacters ? [] : localCharacters };
    }
    const stableCharacters = modelCharacters.flatMap((character, modelIndex) => {
      const matches = localCharacters.filter((localCharacter) => localCharacter.matchedModelIndex === modelIndex);
      if (!matches.length) return [];
      const poseSamples = matches.flatMap((localCharacter) => (
        Array.isArray(localCharacter.poseSamples) ? localCharacter.poseSamples : []
      ));
      return [{
        ...character,
        ...(poseSamples.length ? { poseSamples } : {}),
      }];
    });
    return { ...shot, characters: stableCharacters };
  });
}

function stabilizeDetailedPoseRoot(samples, character) {
  if (!Array.isArray(samples) || samples.length < 2) return samples;
  if (["walk", "run", "side_step_left"].includes(String(character?.action ?? ""))) return samples;
  const hasDetailedPose = Array.isArray(character?.poseSamples)
    && character.poseSamples.some((sample) => sample?.controls && Object.keys(sample.controls).length > 0);
  if (!hasDetailedPose) return samples;
  const xs = samples.map((sample) => clamp(sample.x));
  const depths = samples.map((sample) => clamp(sample.depth));
  if (
    Math.max(...xs) - Math.min(...xs) > STATIONARY_ROOT_MAX_SCREEN_DELTA
    || Math.max(...depths) - Math.min(...depths) > STATIONARY_ROOT_MAX_SCREEN_DELTA
  ) return samples;
  const average = (values) => values.reduce((total, value) => total + value, 0) / values.length;
  const anchorX = average(xs);
  const anchorDepth = average(depths);
  return samples.map((sample) => ({ ...sample, x: anchorX, depth: anchorDepth }));
}

export function compileVideoToDirectorProject(analysis = {}) {
  const sourceShots = Array.isArray(analysis.shots) ? analysis.shots : [];
  const shots = enrichShotsWithLocalPose(sourceShots, analysis.poseAnalysis);
  if (!shots.length) throw new Error("视频分析结果中没有可用分镜");
  const durationMs = Math.max(Number(analysis.durationMs) || 0, 1, ...shots.map((shot) => Number(shot.endMs) || 0));
  const objects = [];
  const assets = [];
  const characterByTrack = new Map();
  const characterItems = [];
  const warnings = Array.isArray(analysis.warnings) ? [...analysis.warnings] : [];

  shots.forEach((shot, shotIndex) => {
    const assignedInShot = new Set();
    (Array.isArray(shot.characters) ? shot.characters : []).forEach((character, characterIndex) => {
      const trackId = String(character.trackId || character.name || `person_${characterItems.length + 1}`);
      const position = characterScreenPosition(character, shot.startMs);
      const normalizedCharacterName = normalizeName(character.name);
      let item = characterByTrack.get(trackId);
      if (!item || assignedInShot.has(item.id)) {
        const candidates = characterItems.filter((candidate) => (
          candidate.lastShotIndex === shotIndex - 1 && !assignedInShot.has(candidate.id)
        ));
        const sameName = normalizedCharacterName
          ? candidates.filter((candidate) => candidate.normalizedName === normalizedCharacterName)
          : [];
        const nearest = (normalizedCharacterName ? sameName : candidates)
          .map((candidate) => ({ candidate, distance: screenDistance(candidate.lastPosition, position) }))
          .sort((left, right) => left.distance - right.distance)[0];
        if (nearest && ((normalizedCharacterName && nearest.distance <= 0.45) || nearest.distance <= 0.22)) {
          item = nearest.candidate;
        } else {
          item = null;
        }
      }
      if (!item) {
        const id = `char_video_${characterItems.length + 1}`;
        item = {
          id,
          name: String(character.name || `人物${characterItems.length + 1}`),
          normalizedName: normalizedCharacterName,
          keyframes: [],
          visibilityRanges: [],
          lastPosition: position,
          lastShotIndex: shotIndex,
          hasLocalPoseTrack: false,
          isPrimary: false,
        };
        characterItems.push(item);
      }
      if (!characterByTrack.has(trackId)) characterByTrack.set(trackId, item);
      if (character.localPoseTrack) item.hasLocalPoseTrack = true;
      if (characterIndex === 0) item.isPrimary = true;
      assignedInShot.add(item.id);
      const sourceSamples = Array.isArray(character.samples) && character.samples.length
        ? character.samples
        : [{ timeMs: shot.startMs, x: 0.5, depth: 0.5 }, { timeMs: shot.endMs, x: 0.5, depth: 0.5 }];
      const samples = stabilizeDetailedPoseRoot(sourceSamples, character);
      if (!character.localPoseTrack) {
        item.visibilityRanges.push({
          startMs: Number(shot.startMs) || 0,
          endMs: Math.max(Number(shot.startMs) || 0, Number(shot.endMs) || 0),
        });
      }
      samples.forEach((sample, sampleIndex) => item.keyframes.push({
        id: `${item.id}_motion_${item.keyframes.length + 1}`,
        time: clamp((Number(sample.timeMs) || 0) / durationMs),
        transform: transform(worldPosition(sample)),
        actionPresetId: ACTION_PRESETS[character.action] ?? null,
        facingMode: sampleIndex < samples.length - 1 ? "path" : "manual",
      }));
      (Array.isArray(character.poseSamples) ? character.poseSamples : []).forEach((poseSample) => {
        const timeMs = Number(poseSample.timeMs) || 0;
        item.keyframes.push({
          id: `${item.id}_motion_${item.keyframes.length + 1}`,
          time: clamp(timeMs / durationMs),
          transform: transform(worldPosition(interpolateCharacterSample(samples, timeMs))),
          actionPresetId: ACTION_PRESETS[character.action] ?? null,
          facingMode: timeMs < Number(samples.at(-1)?.timeMs) ? "path" : "manual",
          poseControls: { ...poseSample.controls },
        });
      });
      const lastSample = samples.at(-1) ?? samples[0];
      item.lastPosition = [clamp(lastSample.x), clamp(lastSample.depth)];
      item.lastShotIndex = shotIndex;
    });
  });

  characterItems.forEach((item) => {
    const deduped = item.keyframes.sort((a, b) => a.time - b.time)
      .reduce((frames, frame) => {
        if (frames.at(-1)?.time === frame.time) {
          const previous = frames.at(-1);
          const poseControls = previous.poseControls || frame.poseControls
            ? { ...previous.poseControls, ...frame.poseControls }
            : undefined;
          frames[frames.length - 1] = { ...previous, ...frame, ...(poseControls ? { poseControls } : {}) };
        }
        else frames.push(frame);
        return frames;
      }, []);
    const firstVisibleFrame = deduped[0];
    const lastVisibleFrame = deduped.at(-1);
    const visibilityTransition = Math.min(0.02, 80 / durationMs);
    if (item.hasLocalPoseTrack) {
      for (let frameIndex = deduped.length - 1; frameIndex > 0; frameIndex -= 1) {
        const previous = deduped[frameIndex - 1];
        const current = deduped[frameIndex];
        if ((current.time - previous.time) * durationMs <= LOCAL_TRACK_MAX_INTERPOLATION_GAP_MS) continue;
        deduped.splice(frameIndex, 0, {
          id: `${item.id}_hidden_gap_${frameIndex}_out`,
          time: Math.min(current.time, previous.time + visibilityTransition),
          transform: transform(previous.transform.position, previous.transform.rotation, [0.001, 0.001, 0.001]),
          actionPresetId: null,
          facingMode: "manual",
        }, {
          id: `${item.id}_hidden_gap_${frameIndex}_in`,
          time: Math.max(previous.time, current.time - visibilityTransition),
          transform: transform(current.transform.position, current.transform.rotation, [0.001, 0.001, 0.001]),
          actionPresetId: null,
          facingMode: "manual",
        });
      }
    }
    const visibilityRanges = item.visibilityRanges.sort((left, right) => left.startMs - right.startMs)
      .reduce((ranges, range) => {
        const previous = ranges.at(-1);
        if (previous && range.startMs - previous.endMs <= LOCAL_TRACK_MAX_INTERPOLATION_GAP_MS) {
          previous.endMs = Math.max(previous.endMs, range.endMs);
        } else ranges.push({ ...range });
        return ranges;
      }, []);
    for (let rangeIndex = visibilityRanges.length - 1; rangeIndex > 0; rangeIndex -= 1) {
      const previousRange = visibilityRanges[rangeIndex - 1];
      const currentRange = visibilityRanges[rangeIndex];
      const previous = [...deduped].reverse().find((frame) => frame.time * durationMs <= previousRange.endMs);
      const current = deduped.find((frame) => frame.time * durationMs >= currentRange.startMs);
      if (!previous || !current) continue;
      deduped.push({
        id: `${item.id}_hidden_range_${rangeIndex}_out`,
        time: Math.min(current.time, previousRange.endMs / durationMs + visibilityTransition),
        transform: transform(previous.transform.position, previous.transform.rotation, [0.001, 0.001, 0.001]),
        actionPresetId: null,
        facingMode: "manual",
      }, {
        id: `${item.id}_hidden_range_${rangeIndex}_in`,
        time: Math.max(previous.time, currentRange.startMs / durationMs - visibilityTransition),
        transform: transform(current.transform.position, current.transform.rotation, [0.001, 0.001, 0.001]),
        actionPresetId: null,
        facingMode: "manual",
      });
    }
    deduped.sort((left, right) => left.time - right.time);
    if (firstVisibleFrame?.time > 0) {
      const hiddenTransform = transform(firstVisibleFrame.transform.position, firstVisibleFrame.transform.rotation, [0.001, 0.001, 0.001]);
      deduped.unshift({
        id: `${item.id}_hidden_start`,
        time: Math.max(0, firstVisibleFrame.time - visibilityTransition),
        transform: hiddenTransform,
        actionPresetId: null,
        facingMode: "manual",
      });
      if (deduped[0].time > 0) {
        deduped.unshift({ ...deduped[0], id: `${item.id}_hidden_zero`, time: 0 });
      }
    }
    if (lastVisibleFrame?.time < 1) {
      const hiddenTransform = transform(lastVisibleFrame.transform.position, lastVisibleFrame.transform.rotation, [0.001, 0.001, 0.001]);
      const hiddenTime = Math.min(1, lastVisibleFrame.time + visibilityTransition);
      deduped.push({
        id: `${item.id}_hidden_end`,
        time: hiddenTime,
        transform: hiddenTransform,
        actionPresetId: null,
        facingMode: "manual",
      });
      if (hiddenTime < 1) {
        deduped.push({ ...deduped.at(-1), id: `${item.id}_hidden_one`, time: 1 });
      }
    }
    objects.push({
      id: item.id,
      name: item.name,
      kind: "character",
      visible: true,
      locked: false,
      bodyType: "mannequin",
      color: item.isPrimary ? PRIMARY_CHARACTER_COLOR : SECONDARY_CHARACTER_COLOR,
      transform: deduped[0]?.transform ?? transform([0, 0, 0]),
      characterRig: { rigType: "ue4-mannequin", posePresetId: "stand", controls: {} },
      motionPath: { interpolation: "smooth", keyframes: deduped },
    });
  });

  const propTracks = new Set();
  shots.forEach((shot) => (Array.isArray(shot.props) ? shot.props : []).forEach((prop) => {
    const trackId = String(prop.trackId || prop.name || `prop_${propTracks.size + 1}`);
    if (propTracks.has(trackId)) return;
    propTracks.add(trackId);
    const id = `prop_video_${propTracks.size}`;
    const matched = matchDirectorPropModel(prop.modelName || prop.name);
    const base = {
      id,
      name: String(prop.name || matched?.name || `道具${propTracks.size}`),
      kind: "prop",
      visible: true,
      locked: false,
      transform: transform(worldPosition(prop)),
    };
    if (matched) {
      const assetId = `asset_video_${assets.length + 1}`;
      assets.push({ id: assetId, kind: "prop", sourceType: "model", fileName: matched.fileName, name: matched.name, url: matched.url, assetSource: "library" });
      objects.push({ ...base, assetRefId: assetId });
    } else {
      warnings.push(`未在导演台模型库中匹配到“${base.name}”，已跳过，避免生成错误占位物。`);
    }
  }));

  const cameraKeyframes = [];
  shots.forEach((shot) => {
    const primary = (Array.isArray(shot.characters) ? shot.characters : [])[0];
    const shotStartMs = Number(shot.startMs) || 0;
    const shotDurationMs = Math.max(1, (Number(shot.endMs) || shotStartMs) - shotStartMs);
    cameraSamples(shot, primary).forEach((sample) => {
      const timeMs = Number(sample.timeMs) || 0;
      cameraKeyframes.push({
        id: `cam_video_motion_${cameraKeyframes.length + 1}`,
        time: clamp(timeMs / durationMs),
        ...cameraFrame(
          shot,
          sample,
          clamp((timeMs - shotStartMs) / shotDurationMs),
          cameraSubjects(shot, timeMs),
        ),
        targetMode: "manual",
        targetObjectId: null,
      });
    });
  });
  const dedupedCameraKeyframes = cameraKeyframes.sort((left, right) => left.time - right.time)
    .reduce((frames, frame) => {
      if (frames.at(-1)?.time === frame.time) frames[frames.length - 1] = frame;
      else frames.push(frame);
      return frames;
    }, []);
  if (dedupedCameraKeyframes.at(-1)?.time < 1) {
    dedupedCameraKeyframes.push({
      ...dedupedCameraKeyframes.at(-1),
      id: `cam_video_motion_${dedupedCameraKeyframes.length + 1}`,
      time: 1,
    });
  }
  const firstCameraFrame = dedupedCameraKeyframes[0];
  const camera = {
    id: "cam_video_master",
    name: "视频主机位",
    fov: firstCameraFrame.fov,
    transform: transform(firstCameraFrame.position),
    targetMode: "manual",
    targetObjectId: null,
    target: firstCameraFrame.target,
    lastCaptureUrl: null,
    captures: [],
    motionPath: {
      duration: clamp(durationMs / 1000, 0.5, 30),
      loop: false,
      interpolation: "smooth",
      easing: "linear",
      keyframes: dedupedCameraKeyframes,
    },
  };
  const cameras = [camera];
  objects.push({
    id: "cam_object_video_master",
    name: camera.name,
    kind: "camera",
    visible: true,
    locked: false,
    linkedCameraId: camera.id,
    transform: camera.transform,
  });

  return {
    project: {
      version: 1,
      scene: {
        scale: 1, position: [0, 0, 0], rotation: [0, 0, 0], backgroundColor: "#000000", backgroundBrightness: 1,
        panoramaYaw: 0, panoramaRadius: 60, showLabels: true, snapToGrid: false, showGround: true,
        groundColor: "#303640", groundBrightness: 1, groundOpacity: 0.4, groundHeight: 0, pathCollisionEnabled: false,
      },
      assets,
      animationAssets: [],
      objects,
      cameras,
      activeCameraId: cameras[0]?.id ?? null,
      panoramaAssetId: null,
    },
    warnings,
    stats: { shots: shots.length, characters: characterItems.length, props: assets.length, matchedProps: assets.length },
  };
}

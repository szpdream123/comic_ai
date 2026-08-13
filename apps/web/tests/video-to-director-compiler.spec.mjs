import assert from "node:assert/strict";
import test from "node:test";

import {
  compileVideoToDirectorProject,
  matchDirectorPropModel,
} from "../src/features/toolbox/video-to-director-compiler.js";

test("video analysis compiles model-backed props, character actions, and one continuous camera", () => {
  const compiled = compileVideoToDirectorProject({
    scene: { name: "客厅" },
    shots: [
      {
        index: 1,
        startMs: 0,
        endMs: 2_000,
        shotSize: "wide",
        cameraMove: "track",
        characters: [{
          trackId: "person_1",
          name: "人物1",
          action: "walk",
          samples: [
            { timeMs: 0, x: 0.2, depth: 0.4 },
            { timeMs: 2_000, x: 0.6, depth: 0.5 },
          ],
        }],
        props: [
          { trackId: "prop_sofa", name: "红色沙发", modelName: "沙发", x: 0.5, depth: 0.7 },
          { trackId: "prop_custom", name: "水晶球", modelName: "水晶球", x: 0.8, depth: 0.2 },
        ],
      },
      {
        index: 2,
        startMs: 2_000,
        endMs: 4_000,
        shotSize: "close",
        cameraMove: "push_in",
        characters: [{
          trackId: "person_1",
          name: "人物1",
          action: "wave",
          samples: [
            { timeMs: 2_000, x: 0.6, depth: 0.5 },
            { timeMs: 4_000, x: 0.65, depth: 0.5 },
          ],
          poseSamples: [{
            timeMs: 3_000,
            controls: { "head.yaw": 18, "rightHand.roll": -16 },
          }, {
            timeMs: 4_000,
            controls: { "rightElbow.bend": 72 },
          }],
        }],
        props: [],
      },
    ],
  });

  assert.equal(compiled.stats.shots, 2);
  assert.equal(compiled.stats.characters, 1);
  assert.equal(compiled.stats.props, 1);
  assert.equal(compiled.stats.matchedProps, 1);
  assert.deepEqual(matchDirectorPropModel("客厅沙发"), {
    name: "沙发",
    fileName: "sofa_modern_low.fbx",
    url: "builtin://life/sofa_modern_low.fbx",
  });

  const sofaAsset = compiled.project.assets[0];
  assert.equal(sofaAsset.url, "builtin://life/sofa_modern_low.fbx");
  assert.equal(sofaAsset.assetSource, "library");
  assert.ok(compiled.project.objects.some((item) => item.name === "红色沙发" && item.assetRefId === sofaAsset.id));
  assert.equal(compiled.project.objects.some((item) => item.name === "水晶球"), false);
  assert.ok(compiled.warnings.some((item) => item.includes("水晶球") && item.includes("已跳过")));

  const character = compiled.project.objects.find((item) => item.kind === "character");
  assert.deepEqual(character.motionPath.keyframes.map((item) => item.actionPresetId), [
    "walk-cycle",
    "wave-cycle",
    "wave-cycle",
    "wave-cycle",
  ]);
  const poseFrame = character.motionPath.keyframes.find((item) => item.poseControls);
  assert.equal(poseFrame.time, 0.75);
  assert.deepEqual(poseFrame.transform.position, [1, 0, 5]);
  assert.deepEqual(poseFrame.poseControls, { "head.yaw": 18, "rightHand.roll": -16 });
  assert.deepEqual(character.motionPath.keyframes.at(-1).poseControls, { "rightElbow.bend": 72 });
  assert.equal(character.motionPath.keyframes.every((item, index, frames) => (
    index === 0 || item.time > frames[index - 1].time
  )), true);
  assert.equal(compiled.project.cameras.length, 1);
  assert.equal(compiled.project.cameras[0].name, "视频主机位");
  assert.equal(compiled.project.cameras[0].targetObjectId, null);
  assert.equal(compiled.project.cameras[0].motionPath.duration, 4);
  assert.deepEqual(compiled.project.cameras[0].motionPath.keyframes.map((item) => item.time), [0, 0.5, 1]);
  assert.equal(compiled.project.cameras[0].motionPath.interpolation, "smooth");
  assert.equal(compiled.project.cameras[0].motionPath.easing, "linear");
  assert.equal(compiled.project.cameras.every((camera) => Number.isFinite(camera.fov)), true);
  assert.equal(compiled.project.objects.filter((item) => item.kind === "camera").length, 1);
  assert.equal(compiled.project.activeCameraId, "cam_video_master");
});

test("video analysis reconnects unstable adjacent character ids without merging simultaneous actors", () => {
  const compiled = compileVideoToDirectorProject({
    shots: [{
      index: 1,
      startMs: 0,
      endMs: 1_000,
      shotSize: "wide",
      cameraMove: "static",
      characters: [
        { trackId: "shot1_left", name: "舞者", samples: [{ timeMs: 0, x: 0.2, depth: 0.5 }, { timeMs: 1_000, x: 0.25, depth: 0.5 }] },
        { trackId: "shot1_right", name: "舞者", samples: [{ timeMs: 0, x: 0.8, depth: 0.5 }, { timeMs: 1_000, x: 0.75, depth: 0.5 }] },
      ],
      props: [],
    }, {
      index: 2,
      startMs: 1_000,
      endMs: 2_000,
      shotSize: "medium",
      cameraMove: "track",
      characters: [
        { trackId: "shot2_a", name: "舞者", samples: [{ timeMs: 1_000, x: 0.24, depth: 0.5 }, { timeMs: 2_000, x: 0.3, depth: 0.5 }] },
        { trackId: "shot2_b", name: "舞者", samples: [{ timeMs: 1_000, x: 0.76, depth: 0.5 }, { timeMs: 2_000, x: 0.7, depth: 0.5 }] },
      ],
      props: [],
    }],
  });

  const characters = compiled.project.objects.filter((item) => item.kind === "character");
  assert.equal(compiled.stats.characters, 2);
  assert.equal(characters.length, 2);
  assert.deepEqual(characters.map((item) => item.color), ["#E0524D", "#FFFFFF"]);
  assert.deepEqual(characters.map((item) => item.motionPath.keyframes.map((frame) => frame.time)), [
    [0, 0.5, 1],
    [0, 0.5, 1],
  ]);
});

test("video compilation preserves depth, dance beats, appearances, and sampled camera framing", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 4_000,
    shots: [{
      index: 1,
      startMs: 0,
      endMs: 3_000,
      shotSize: "medium",
      cameraMove: "pull_out",
      characters: [{
        trackId: "lead",
        name: "领舞",
        action: "dance",
        samples: [
          { timeMs: 0, x: 0.5, depth: 0.1 },
          { timeMs: 1_000, x: 0.45, depth: 0.3 },
          { timeMs: 2_000, x: 0.55, depth: 0.6 },
          { timeMs: 3_000, x: 0.5, depth: 0.9 },
        ],
      }],
      props: [],
    }, {
      index: 2,
      startMs: 3_000,
      endMs: 4_000,
      shotSize: "close",
      cameraMove: "static",
      characters: [0.1, 0.3, 0.5, 0.7, 0.9].map((x, index) => ({
        trackId: `montage_person_${index + 1}`,
        name: index === 0 ? "蒙太奇人物" : `群舞人物${index + 1}`,
        action: "dance",
        samples: [
          { timeMs: 3_000, x, depth: 0.2 + index * 0.04 },
          { timeMs: 4_000, x, depth: 0.2 + index * 0.04 },
        ],
      })),
      props: [],
    }],
  });

  const lead = compiled.project.objects.find((item) => item.name === "领舞");
  const leadVisibleFrames = lead.motionPath.keyframes.filter((frame) => frame.transform.scale[0] === 1);
  assert.equal(leadVisibleFrames[0].actionPresetId, "dance-cycle");
  assert.equal(leadVisibleFrames[0].transform.position[2], 7.4);
  assert.equal(leadVisibleFrames.at(-1).transform.position[2], 2.6);
  assert.deepEqual(lead.motionPath.keyframes.at(-1).transform.scale, [0.001, 0.001, 0.001]);
  assert.equal(lead.motionPath.keyframes.at(-1).time, 1);

  const montagePerson = compiled.project.objects.find((item) => item.name === "蒙太奇人物");
  assert.equal(montagePerson.motionPath.keyframes[0].time, 0);
  assert.deepEqual(montagePerson.motionPath.keyframes[0].transform.scale, [0.001, 0.001, 0.001]);
  assert.deepEqual(montagePerson.motionPath.keyframes.find((frame) => frame.time === 0.75).transform.scale, [1, 1, 1]);

  const cameraFrames = compiled.project.cameras[0].motionPath.keyframes;
  assert.deepEqual(cameraFrames.map((frame) => frame.time), [0, 0.25, 0.5, 0.75, 1]);
  const nearDistance = cameraFrames[0].position[2] - cameraFrames[0].target[2];
  const fartherDistance = cameraFrames[2].position[2] - cameraFrames[2].target[2];
  assert.ok(nearDistance < fartherDistance);
  const groupFrame = cameraFrames.find((frame) => frame.time === 0.75);
  const groupCameraDepth = groupFrame.position[2] - groupFrame.target[2];
  const groupHorizontalHalfWidth = groupCameraDepth
    * Math.tan((groupFrame.fov * Math.PI / 180) / 2) * (16 / 9);
  assert.ok(groupFrame.fov >= 60);
  assert.ok(Math.abs(groupFrame.target[0]) < 0.001);
  assert.ok(groupHorizontalHalfWidth >= 3.2);
});

test("video compilation keeps the master camera alive through the exact source duration", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 3_000,
    shots: [{
      index: 1,
      startMs: 0,
      endMs: 2_000,
      shotSize: "medium",
      cameraMove: "static",
      characters: [],
      props: [],
    }],
  });

  const camera = compiled.project.cameras[0];
  assert.equal(camera.motionPath.duration, 3);
  assert.deepEqual(camera.motionPath.keyframes.map((frame) => frame.time), [0, 2 / 3, 1]);
  assert.deepEqual(camera.motionPath.keyframes.at(-1).position, camera.motionPath.keyframes.at(-2).position);
});

test("local pose tracks enrich model people without creating additional people", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 1_000,
    poseAnalysis: {
      tracks: [{
        trackId: "local_lead",
        primaryScore: 0.9,
        firstSeenMs: 0,
        lastSeenMs: 1_000,
        samples: [
          { timeMs: 0, x: 0.5, y: 0.9, depth: 0.2, confidence: 0.9, controls: { "leftElbow.bend": 30 } },
          { timeMs: 500, x: 0.55, y: 0.9, depth: 0.2, confidence: 0.9, controls: { "leftElbow.bend": 75 } },
          { timeMs: 1_000, x: 0.6, y: 0.9, depth: 0.2, confidence: 0.9, controls: { "leftElbow.bend": 45 } },
        ],
      }, {
        trackId: "local_extra",
        primaryScore: 0.6,
        firstSeenMs: 0,
        lastSeenMs: 1_000,
        samples: [
          { timeMs: 0, x: 0.2, y: 0.9, depth: 0.5, confidence: 0.8, controls: { "rightKnee.bend": 20 } },
          { timeMs: 1_000, x: 0.25, y: 0.9, depth: 0.5, confidence: 0.8, controls: { "rightKnee.bend": 55 } },
        ],
      }],
    },
    shots: [{
      startMs: 0,
      endMs: 1_000,
      shotSize: "medium",
      cameraMove: "static",
      characters: [{
        trackId: "model_lead",
        name: "领舞",
        action: "dance",
        confidence: 0.8,
        samples: [{ timeMs: 0, x: 0.5, depth: 0.2 }, { timeMs: 1_000, x: 0.6, depth: 0.2 }],
      }],
      props: [],
    }],
  });

  const characters = compiled.project.objects.filter((item) => item.kind === "character");
  assert.equal(characters.length, 1);
  assert.equal(characters[0].name, "领舞");
  assert.deepEqual(
    characters[0].motionPath.keyframes.filter((frame) => frame.poseControls).map((frame) => frame.poseControls["leftElbow.bend"]),
    [30, 75, 45],
  );
});

test("single stationary subject ignores local pose fragments and root tracking jitter", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 13_033,
    poseAnalysis: {
      tracks: [{
        trackId: "local_lead",
        primaryScore: 0.95,
        firstSeenMs: 0,
        lastSeenMs: 10_000,
        samples: [
          { timeMs: 0, x: 0.5, y: 0.84, depth: 0.27, controls: { "rightElbow.bend": 30 } },
          { timeMs: 5_000, x: 0.51, y: 0.84, depth: 0.27, controls: { "rightElbow.bend": 90 } },
          { timeMs: 10_000, x: 0.49, y: 0.84, depth: 0.27, controls: { "rightElbow.bend": 45 } },
        ],
      }, {
        trackId: "ending_avatar_fragment_a",
        primaryScore: 0.7,
        firstSeenMs: 10_167,
        lastSeenMs: 11_500,
        samples: [
          { timeMs: 10_167, x: 0.55, y: 0.5, depth: 0.4, controls: { "leftShoulder.pitch": 25 } },
          { timeMs: 11_500, x: 0.58, y: 0.5, depth: 0.4, controls: { "leftShoulder.pitch": 35 } },
        ],
      }, {
        trackId: "ending_avatar_fragment_b",
        primaryScore: 0.65,
        firstSeenMs: 11_667,
        lastSeenMs: 13_000,
        samples: [
          { timeMs: 11_667, x: 0.6, y: 0.5, depth: 0.4, controls: { "rightShoulder.pitch": 20 } },
          { timeMs: 13_000, x: 0.62, y: 0.5, depth: 0.4, controls: { "rightShoulder.pitch": 30 } },
        ],
      }],
    },
    shots: [{
      startMs: 0,
      endMs: 10_100,
      shotSize: "medium",
      cameraMove: "static",
      characters: [{
        trackId: "person_1",
        name: "女性舞者",
        action: "dance",
        samples: [
          { timeMs: 0, x: 0.5, depth: 0.27 },
          { timeMs: 667, x: 0.51, depth: 0.27 },
          { timeMs: 1_333, x: 0.49, depth: 0.27 },
          { timeMs: 10_100, x: 0.5, depth: 0.27 },
        ],
      }],
      props: [],
    }, {
      startMs: 10_100,
      endMs: 13_033,
      shotSize: "wide",
      cameraMove: "static",
      characters: [],
      props: [],
    }],
  });

  const characters = compiled.project.objects.filter((item) => item.kind === "character");
  const visiblePositions = characters[0].motionPath.keyframes
    .filter((frame) => frame.transform.scale[0] === 1)
    .map((frame) => frame.transform.position.join(","));
  assert.equal(characters.length, 1);
  assert.equal(characters[0].name, "女性舞者");
  assert.equal(new Set(visiblePositions).size, 1);
  assert.deepEqual(
    characters[0].motionPath.keyframes.filter((frame) => frame.poseControls).map((frame) => frame.poseControls["rightElbow.bend"]),
    [30, 90, 45],
  );
});

test("model characters remain the stable track backbone when local pose detections fragment", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 4_000,
    poseAnalysis: {
      tracks: [{
        trackId: "local_fragment",
        primaryScore: 0.8,
        firstSeenMs: 500,
        lastSeenMs: 1_000,
        samples: [
          { timeMs: 500, x: 0.5, y: 0.9, depth: 0.3, confidence: 0.9, controls: { "leftElbow.bend": 35 } },
          { timeMs: 1_000, x: 0.52, y: 0.9, depth: 0.3, confidence: 0.9, controls: { "leftElbow.bend": 70 } },
        ],
      }, {
        trackId: "unmatched_fragment",
        primaryScore: 0.4,
        firstSeenMs: 2_000,
        lastSeenMs: 2_500,
        samples: [
          { timeMs: 2_000, x: 0.95, y: 0.9, depth: 0.9, confidence: 0.7, controls: { "rightKnee.bend": 30 } },
          { timeMs: 2_500, x: 0.95, y: 0.9, depth: 0.9, confidence: 0.7, controls: { "rightKnee.bend": 45 } },
        ],
      }],
    },
    shots: [{
      startMs: 0,
      endMs: 4_000,
      characters: [{
        trackId: "model_lead",
        name: "领舞",
        action: "dance",
        samples: [
          { timeMs: 0, x: 0.5, depth: 0.3 },
          { timeMs: 4_000, x: 0.55, depth: 0.3 },
        ],
      }],
      props: [],
    }],
  });

  const characters = compiled.project.objects.filter((item) => item.kind === "character");
  const visibleFrames = characters[0].motionPath.keyframes.filter((frame) => frame.transform.scale[0] === 1);
  assert.equal(characters.length, 1);
  assert.equal(characters[0].name, "领舞");
  assert.equal(visibleFrames[0].time, 0);
  assert.equal(visibleFrames.at(-1).time, 1);
  assert.deepEqual(
    visibleFrames.filter((frame) => frame.poseControls).map((frame) => frame.poseControls["leftElbow.bend"]),
    [35, 70],
  );
});

test("model-backed characters remain visible across local pose detection gaps", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 4_000,
    poseAnalysis: { tracks: [{
      trackId: "local_lead",
      firstSeenMs: 0,
      lastSeenMs: 4_000,
      samples: [
        { timeMs: 0, x: 0.5, y: 0.9, depth: 0.3, controls: { "leftElbow.bend": 30 } },
        { timeMs: 4_000, x: 0.55, y: 0.9, depth: 0.3, controls: { "leftElbow.bend": 60 } },
      ],
    }] },
    shots: [{
      startMs: 0,
      endMs: 4_000,
      characters: [{
        trackId: "model_lead", name: "领舞", action: "dance",
        samples: [{ timeMs: 0, x: 0.5, depth: 0.3 }, { timeMs: 4_000, x: 0.55, depth: 0.3 }],
      }],
      props: [],
    }],
  });

  const character = compiled.project.objects.find((item) => item.kind === "character");
  assert.equal(character.motionPath.keyframes.some((frame) => (
    frame.time > 0 && frame.time < 1 && frame.transform.scale[0] === 0.001
  )), false);
});

test("named people from adjacent montage shots do not merge by position alone", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 2_000,
    shots: [{
      startMs: 0, endMs: 1_000,
      characters: [{ trackId: "lead_a", name: "白衣男主", samples: [{ timeMs: 0, x: 0.5, depth: 0.3 }] }], props: [],
    }, {
      startMs: 1_000, endMs: 2_000,
      characters: [{ trackId: "lead_b", name: "橙发人物", samples: [{ timeMs: 1_000, x: 0.5, depth: 0.3 }] }], props: [],
    }],
  });

  assert.deepEqual(
    compiled.project.objects.filter((item) => item.kind === "character").map((item) => item.name),
    ["白衣男主", "橙发人物"],
  );
});

test("local pose tracks suppress unmatched model-only duplicate people", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 1_000,
    poseAnalysis: {
      tracks: [{
        trackId: "local_lead",
        primaryScore: 0.9,
        firstSeenMs: 0,
        lastSeenMs: 1_000,
        samples: [
          { timeMs: 0, x: 0.5, y: 0.9, depth: 0.2, controls: { "leftElbow.bend": 30 } },
          { timeMs: 1_000, x: 0.5, y: 0.9, depth: 0.2, controls: { "leftElbow.bend": 45 } },
        ],
      }],
    },
    shots: [{
      startMs: 0,
      endMs: 1_000,
      characters: [
        { name: "真实主体", action: "dance", samples: [{ timeMs: 500, x: 0.5, depth: 0.2 }] },
        { name: "重复人物", action: "dance", samples: [{ timeMs: 500, x: 0.9, depth: 0.2 }] },
      ],
      props: [],
    }],
  });

  assert.deepEqual(compiled.project.objects.filter((item) => item.kind === "character").map((item) => item.name), ["真实主体"]);
});

test("model people remain as fallback when local pose misses an entire shot", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 2_000,
    poseAnalysis: {
      tracks: [{
        trackId: "local_lead",
        firstSeenMs: 0,
        lastSeenMs: 900,
        samples: [{ timeMs: 0, x: 0.1, y: 0.9, depth: 0.2, controls: {} }, { timeMs: 900, x: 0.1, y: 0.9, depth: 0.2, controls: {} }],
      }],
    },
    shots: [{ startMs: 0, endMs: 900, characters: [], props: [] }, {
      startMs: 1_100,
      endMs: 2_000,
      characters: [{ trackId: "model_late", name: "后镜人物", action: "run", samples: [{ timeMs: 1_100, x: 0.9, depth: 0.3 }] }],
      props: [],
    }],
  });

  assert.equal(compiled.project.objects.some((item) => item.kind === "character" && item.name === "后镜人物"), true);
});

test("local pose gaps hide the character instead of inventing cross-gap motion", () => {
  const localTrack = (trackId, firstSeenMs, lastSeenMs, x) => ({
    trackId, firstSeenMs, lastSeenMs, primaryScore: 0.9,
    samples: [firstSeenMs, lastSeenMs].map((timeMs) => ({
      timeMs, x, y: 0.9, depth: 0.3, confidence: 0.9,
      controls: { "leftElbow.bend": timeMs === firstSeenMs ? 20 : 40 },
    })),
  });
  const modelCharacter = (startMs, endMs, x) => ({
    trackId: "model_lead", name: "领舞", action: "dance",
    samples: [{ timeMs: startMs, x, depth: 0.3 }, { timeMs: endMs, x, depth: 0.3 }],
  });
  const compiled = compileVideoToDirectorProject({
    durationMs: 2_000,
    poseAnalysis: { tracks: [
      localTrack("local_early", 0, 167, 0.2),
      localTrack("local_late", 1_800, 2_000, 0.8),
    ] },
    shots: [
      { startMs: 0, endMs: 167, characters: [modelCharacter(0, 167, 0.2)], props: [] },
      { startMs: 1_800, endMs: 2_000, characters: [modelCharacter(1_800, 2_000, 0.8)], props: [] },
    ],
  });

  const character = compiled.project.objects.find((item) => item.kind === "character");
  const hiddenGapFrames = character.motionPath.keyframes.filter((frame) => (
    frame.time > 0.0835 && frame.time < 0.9 && frame.transform.scale[0] === 0.001
  ));
  assert.equal(compiled.stats.characters, 1);
  assert.equal(hiddenGapFrames.length, 2);
  assert.ok(hiddenGapFrames[0].time < hiddenGapFrames[1].time);
});

test("local pose tracks select the main subject independently for each shot", () => {
  const compiled = compileVideoToDirectorProject({
    durationMs: 2_000,
    poseAnalysis: {
      tracks: [{
        trackId: "first_lead",
        primaryScore: 0.45,
        firstSeenMs: 0,
        lastSeenMs: 2_000,
        samples: [
          { timeMs: 0, x: 0.4, y: 0.9, depth: 0.3, bbox: [0.2, 0.1, 0.6, 0.9], controls: {} },
          { timeMs: 999, x: 0.4, y: 0.9, depth: 0.3, bbox: [0.2, 0.1, 0.6, 0.9], controls: {} },
          { timeMs: 1_001, x: 0.2, y: 0.9, depth: 0.6, bbox: [0.15, 0.4, 0.25, 0.9], controls: {} },
          { timeMs: 2_000, x: 0.2, y: 0.9, depth: 0.6, bbox: [0.15, 0.4, 0.25, 0.9], controls: {} },
        ],
      }, {
        trackId: "second_lead",
        primaryScore: 0.9,
        firstSeenMs: 0,
        lastSeenMs: 2_000,
        samples: [
          { timeMs: 0, x: 0.8, y: 0.9, depth: 0.6, bbox: [0.75, 0.4, 0.85, 0.9], controls: {} },
          { timeMs: 999, x: 0.8, y: 0.9, depth: 0.6, bbox: [0.75, 0.4, 0.85, 0.9], controls: {} },
          { timeMs: 1_001, x: 0.6, y: 0.9, depth: 0.1, bbox: [0.3, 0.05, 0.9, 0.95], controls: {} },
          { timeMs: 2_000, x: 0.6, y: 0.9, depth: 0.1, bbox: [0.3, 0.05, 0.9, 0.95], controls: {} },
        ],
      }],
    },
    shots: [{ startMs: 0, endMs: 999, characters: [{ name: "首镜主体", action: "dance", samples: [{ timeMs: 500, x: 0.4, depth: 0.3 }] }], props: [] }, {
      startMs: 1_001, endMs: 2_000, characters: [{ name: "次镜主体", action: "run", samples: [{ timeMs: 1_500, x: 0.6, depth: 0.1 }] }], props: [],
    }],
  });

  const characters = compiled.project.objects.filter((item) => item.kind === "character");
  const firstLead = characters.find((item) => item.name === "首镜主体");
  const secondLead = characters.find((item) => item.id !== firstLead.id);
  assert.equal(firstLead.motionPath.keyframes.some((frame) => frame.actionPresetId === "dance-cycle"), true);
  assert.equal(secondLead.motionPath.keyframes.some((frame) => frame.actionPresetId === "run-cycle"), true);
});

test("video director compilation requires at least one shot", () => {
  assert.throws(() => compileVideoToDirectorProject({ shots: [] }), /没有可用分镜/);
});

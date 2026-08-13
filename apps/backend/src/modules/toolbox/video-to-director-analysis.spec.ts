import assert from "node:assert/strict";
import test from "node:test";

import {
  completeVideoToDirectorWithProviderStreamRetry,
  normalizeVideoShotSegments,
  parseVideoToDirectorResult,
  videoToDirectorInstruction,
} from "./video-to-director-analysis.ts";

test("video director retries one empty provider stream failure", async () => {
  let attempts = 0;
  const result = await completeVideoToDirectorWithProviderStreamRetry(async () => {
    attempts += 1;
    if (attempts === 1) {
      throw Object.assign(new Error("provider_stream_error"), { responseText: "", usage: null });
    }
    return { content: "ok" };
  });

  assert.equal(attempts, 2);
  assert.deepEqual(result, { content: "ok" });
});

test("video director does not retry partial or billed provider failures", async () => {
  for (const detail of [
    { responseText: "partial", usage: null },
    { responseText: "", usage: { total_tokens: 12 } },
  ]) {
    let attempts = 0;
    await assert.rejects(
      completeVideoToDirectorWithProviderStreamRetry(async () => {
        attempts += 1;
        throw Object.assign(new Error("provider_stream_error"), detail);
      }),
      /provider_stream_error/,
    );
    assert.equal(attempts, 1);
  }
});

test("video director analysis normalizes model output into bounded shots", () => {
  const result = parseVideoToDirectorResult(JSON.stringify({
    summary: "测试预演",
    scene: { name: "办公室", description: "人物经过桌旁" },
    shots: [{
      index: 99,
      startMs: -500,
      endMs: 20_000,
      shotSize: "invalid",
      cameraMove: "track",
      cameraConfidence: 2,
      characters: [{
        trackId: "person_a",
        name: "甲",
        action: "dance",
        confidence: -1,
        samples: [{ timeMs: -1, x: -2, y: 2, depth: 0.4 }],
        poseSamples: [
          { timeMs: -1, confidence: 1, controls: { "head.yaw": 20 } },
          { timeMs: 500, confidence: 1.5, controls: {
            "head.yaw": 200,
            "rightElbow.bend": 74,
            "rightHand.roll": -16,
            "body.offsetY": -2,
            "leftHip.spread": -120,
            "rightKnee.bend": 200,
            "leftHand.pitch": "bad",
            "finger.index": 40,
          } },
          { timeMs: 750, confidence: -1, controls: { "unknown.control": 10 } },
          { timeMs: 10_001, confidence: 1, controls: { "head.pitch": 10 } },
        ],
      }],
      props: [{
        trackId: "desk_a",
        name: "办公桌",
        modelName: "办公桌",
        confidence: 1.5,
        x: 3,
        y: -2,
        depth: 0.6,
      }],
    }],
  }), 10_000);

  assert.equal(result.shots.length, 1);
  assert.deepEqual(result.shots[0], {
    index: 1,
    startMs: 0,
    endMs: 10_000,
    shotSize: "medium",
    cameraMove: "track",
    cameraConfidence: 1,
    characters: [{
      trackId: "person_a",
      name: "甲",
      action: "dance",
      confidence: 0,
      samples: [{ timeMs: 0, x: 0, y: 1, depth: 0.4 }],
      poseSamples: [{
        timeMs: 500,
        confidence: 1,
        controls: {
          "head.yaw": 80,
          "rightElbow.bend": 74,
          "rightHand.roll": -16,
          "body.offsetY": -0.8,
          "leftHip.spread": -100,
          "rightKnee.bend": 140,
        },
      }],
    }],
    props: [{
      trackId: "desk_a",
      name: "办公桌",
      modelName: "办公桌",
      confidence: 1,
      x: 1,
      y: 0,
      depth: 0.6,
    }],
  });
});

test("video director asks for supported key poses without unsupported finger joints", () => {
  assert.match(videoToDirectorInstruction, /poseSamples/);
  assert.match(videoToDirectorInstruction, /dance/);
  assert.match(videoToDirectorInstruction, /500 至 1000 毫秒/);
  assert.match(videoToDirectorInstruction, /shoulder\/hip/);
  assert.match(videoToDirectorInstruction, /elbow\/knee/);
  assert.match(videoToDirectorInstruction, /不要输出手指关节/);
  assert.doesNotMatch(videoToDirectorInstruction, /不要输出骨骼关节/);
});

test("video director analysis rejects empty model output and bounds browser segments", () => {
  assert.throws(
    () => parseVideoToDirectorResult('{"shots":[]}', 1_000),
    /video_to_director_result_empty/,
  );
  assert.deepEqual(normalizeVideoShotSegments([
    { startMs: -50, endMs: 500, confidence: -1 },
    { startMs: 900, endMs: 2_000, confidence: 2 },
  ], 1_000), [
    { index: 1, startMs: 0, endMs: 500, confidence: 0 },
    { index: 2, startMs: 900, endMs: 1_000, confidence: 1 },
  ]);
});

test("video director repairs a shots array closed before the next shot", () => {
  const malformed = '{"summary":"舞蹈","scene":{"name":"走廊"},"shots":[{"index":1,"startMs":0,"endMs":1000,"characters":[],"props":[]}]},{"index":2,"startMs":1000,"endMs":2000,"characters":[],"props":[]}],"warnings":[]}';

  const result = parseVideoToDirectorResult(malformed, 2_000);

  assert.equal(result.shots.length, 2);
  assert.deepEqual(result.shots.map((shot) => [shot.startMs, shot.endMs]), [
    [0, 1_000],
    [1_000, 2_000],
  ]);
});

test("video director does not repair unrelated malformed JSON", () => {
  assert.throws(
    () => parseVideoToDirectorResult('{"shots":[{"index":1}] trailing}', 1_000),
    /video_to_director_result_invalid/,
  );
});

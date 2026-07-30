import { describe, expect, it } from "vitest";
import {
  createReferenceVideoFramePlan,
  getReferenceVideoCodecCandidates,
  selectReferenceVideoEncoding,
} from "./referenceVideoEncoding";

describe("reference video frame plan", () => {
  it("creates exactly 360 deterministic frames for six seconds at 60 FPS", () => {
    const frames = createReferenceVideoFramePlan(6, 60);

    expect(frames).toHaveLength(360);
    expect(frames[0]).toMatchObject({ index: 0, timestamp: 0, progress: 0 });
    expect(frames[1].timestamp).toBeCloseTo(1 / 60, 10);
    expect(frames[frames.length - 1]?.timestamp).toBeCloseTo(6 - 1 / 60, 10);
    expect(frames.reduce((sum, frame) => sum + frame.duration, 0)).toBeCloseTo(6, 10);
  });

  it.each([24, 30, 60])("keeps the declared duration at 6 seconds for %i FPS", (fps) => {
    const frames = createReferenceVideoFramePlan(6, fps);

    expect(frames).toHaveLength(6 * fps);
    const lastFrame = frames[frames.length - 1];
    expect(lastFrame).toBeDefined();
    expect((lastFrame?.timestamp ?? 0) + (lastFrame?.duration ?? 0)).toBeCloseTo(6, 10);
  });
});

describe("reference video encoder selection", () => {
  it("falls back to other MP4 codecs when AVC is unavailable", async () => {
    const checkedCodecs: string[] = [];
    const encoding = await selectReferenceVideoEncoding({
      bitrate: 45_000_000,
      format: "mp4",
      height: 2160,
      width: 3840,
    }, async (codec) => {
      checkedCodecs.push(codec);
      return codec === "hevc";
    });

    expect(getReferenceVideoCodecCandidates("mp4")).toEqual(["avc", "hevc", "av1", "vp9"]);
    expect(checkedCodecs).toContain("avc");
    expect(encoding).toMatchObject({ codec: "hevc", bitrate: 30_000_000 });
  });

  it("keeps AVC and the requested bitrate when the browser supports them", async () => {
    const encoding = await selectReferenceVideoEncoding({
      bitrate: 8_000_000,
      format: "mp4",
      height: 720,
      width: 1280,
    }, async (codec, options) => codec === "avc" && options?.bitrate === 8_000_000);

    expect(encoding).toMatchObject({ codec: "avc", bitrate: 8_000_000 });
  });
});

import assert from "node:assert/strict";
import test from "node:test";

import { parseCanvasAgentVideoProbe } from "../canvas-agent-video-inspection.service.ts";

test("Canvas Agent video inspection normalizes FFprobe metadata without exposing the source URL", () => {
  const result = parseCanvasAgentVideoProbe(JSON.stringify({
    format: {
      format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      duration: "12.345",
      size: "1048576",
      bit_rate: "678901",
    },
    streams: [
      {
        codec_type: "video",
        codec_name: "h264",
        width: 1920,
        height: 1080,
        avg_frame_rate: "30000/1001",
      },
      { codec_type: "audio", codec_name: "aac", channels: 2, sample_rate: "48000" },
    ],
  }));

  assert.deepEqual(result, {
    version: 1,
    source: "ffprobe",
    durationMs: 12345,
    container: { formatName: "mov,mp4,m4a,3gp,3g2,mj2", sizeBytes: 1048576, bitRate: 678901 },
    video: { codec: "h264", width: 1920, height: 1080, frameRate: 29.97 },
    hasAudio: true,
    audio: { codec: "aac", channels: 2, sampleRate: 48000 },
  });
  assert.doesNotMatch(JSON.stringify(result), /https?:\/\//);
});

test("Canvas Agent video inspection rejects probe output without a video stream", () => {
  assert.throws(
    () => parseCanvasAgentVideoProbe(JSON.stringify({ streams: [{ codec_type: "audio" }] })),
    /canvas_agent_video_stream_missing/,
  );
});

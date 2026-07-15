import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import JSZip from "jszip";

import {
  buildJianyingDraftContent,
  sanitizePortableFileName,
  writeJianyingDraftPackage,
  writeStoryboardVideoPackage,
} from "../jianying-draft.service.ts";

describe("jianying draft service", () => {
  it("places storyboard videos sequentially on one editable video track", () => {
    const idFactory = sequentialIdFactory();
    const draft = buildJianyingDraftContent({
      draftName: "Episode 1",
      width: 1920,
      height: 1080,
      fps: 30,
      clips: [
        clip("shot-1", "001.mp4", 5_000_000),
        clip("shot-2", "002.mp4", 7_200_000),
      ],
      idFactory,
    });

    assert.equal(draft.name, "Episode 1");
    assert.equal(draft.duration, 12_200_000);
    assert.deepEqual(draft.canvas_config, {
      width: 1920,
      height: 1080,
      ratio: "original",
    });
    assert.equal(draft.materials.videos.length, 2);
    assert.equal(draft.materials.videos[0]?.path, "assets/video/001.mp4");
    assert.equal(draft.materials.videos[1]?.path, "assets/video/002.mp4");
    assert.equal(draft.tracks.length, 1);
    assert.equal(draft.tracks[0]?.type, "video");
    assert.deepEqual(
      draft.tracks[0]?.segments.map((segment) => segment.target_timerange),
      [
        { start: 0, duration: 5_000_000 },
        { start: 5_000_000, duration: 7_200_000 },
      ],
    );
    assert.deepEqual(
      draft.tracks[0]?.segments.map((segment) => segment.source_timerange),
      [
        { start: 0, duration: 5_000_000 },
        { start: 0, duration: 7_200_000 },
      ],
    );
  });

  it("writes a portable zip with draft files and relative media paths", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "comic-ai-jianying-test-"));
    try {
      const firstVideo = join(tempRoot, "source-one.mp4");
      const secondVideo = join(tempRoot, "source-two.mp4");
      const archivePath = join(tempRoot, "episode-one.zip");
      await writeFile(firstVideo, Buffer.from("video-one"));
      await writeFile(secondVideo, Buffer.from("video-two"));

      const result = await writeJianyingDraftPackage({
        archivePath,
        draftName: "Episode One",
        width: 1080,
        height: 1920,
        fps: 30,
        clips: [
          { ...clip("shot-1", "001.mp4", 5_000_000), sourceFilePath: firstVideo },
          { ...clip("shot-2", "002.mp4", 6_000_000), sourceFilePath: secondVideo },
        ],
        idFactory: sequentialIdFactory(),
      });

      assert.equal(result.folderName, "Episode One");
      assert.equal(result.clipCount, 2);
      assert.ok(result.sizeBytes > 0);

      const zip = await JSZip.loadAsync(await readFile(archivePath));
      assert.ok(zip.file("Episode One/draft_content.json"));
      assert.ok(zip.file("Episode One/draft_meta_info.json"));
      assert.equal(
        await zip.file("Episode One/assets/video/001.mp4")?.async("string"),
        "video-one",
      );
      assert.equal(
        await zip.file("Episode One/assets/video/002.mp4")?.async("string"),
        "video-two",
      );

      const content = JSON.parse(
        await zip.file("Episode One/draft_content.json")!.async("string"),
      );
      const meta = JSON.parse(
        await zip.file("Episode One/draft_meta_info.json")!.async("string"),
      );
      assert.equal(content.duration, 11_000_000);
      assert.equal(content.materials.videos[0].path, "assets/video/001.mp4");
      assert.equal(meta.draft_name, "Episode One");
      assert.equal(meta.draft_id, content.id);
      assert.equal(meta.tm_duration, 11_000_000);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("writes selected storyboard videos with episode and storyboard names", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "comic-ai-video-package-test-"));
    try {
      const firstVideo = join(tempRoot, "source-one.mp4");
      const secondVideo = join(tempRoot, "source-two.mp4");
      const archivePath = join(tempRoot, "selected-videos.zip");
      await writeFile(firstVideo, Buffer.from("video-one"));
      await writeFile(secondVideo, Buffer.from("video-two"));

      const result = await writeStoryboardVideoPackage({
        archivePath,
        folderName: "第1集:启程-MP4",
        clips: [
          { fileName: "001-第1集-分镜一.mp4", sourceFilePath: firstVideo },
          { fileName: "002-第1集-分镜二.mp4", sourceFilePath: secondVideo },
        ],
      });

      assert.equal(result.folderName, "第1集-启程-MP4");
      assert.equal(result.clipCount, 2);
      const zip = await JSZip.loadAsync(await readFile(archivePath));
      assert.equal(
        await zip.file("第1集-启程-MP4/001-第1集-分镜一.mp4")?.async("string"),
        "video-one",
      );
      assert.equal(
        await zip.file("第1集-启程-MP4/002-第1集-分镜二.mp4")?.async("string"),
        "video-two",
      );
      assert.equal(sanitizePortableFileName('剧集<>:"/\\|?*分镜'), "剧集-分镜");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});

function clip(storyboardId: string, fileName: string, durationUs: number) {
  return {
    storyboardId,
    title: storyboardId,
    fileName,
    durationUs,
    width: 1920,
    height: 1080,
  };
}

function sequentialIdFactory() {
  let index = 0;
  return () => `00000000-0000-4000-8000-${String(++index).padStart(12, "0")}`;
}

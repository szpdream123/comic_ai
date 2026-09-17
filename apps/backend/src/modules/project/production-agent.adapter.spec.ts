import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createProductionManifest } from "./production-agent.adapter.ts";
import { validateProductionManifest } from "./production-agent.validator.ts";

describe("production agent manifest validation", () => {
  it("accepts the existing project-compatible payload", () => {
    const result = validateProductionManifest({
      schemaVersion: "creator-production.v1",
      source: { kind: "script" },
      project: { projectId: "project-1" },
      scriptText: "场景：大厅。人物动作：进入。",
      scenes: [{ key: "scene_1", name: "大厅" }],
      characters: [{ key: "character_1", name: "主角" }],
      props: [{ key: "prop_1", name: "钥匙" }],
      storyboards: [{ plot: "主角进入大厅", sceneKey: "scene_1", characterKeys: ["character_1"], propKeys: ["prop_1"] }],
    });
    assert.deepEqual(result, { valid: true, errors: [] });
  });

  it("defers shot reference resolution to the project commit service", () => {
    const result = validateProductionManifest({
      schemaVersion: "creator-production.v1",
      source: { kind: "text" },
      project: { projectId: "project-1" },
      scriptText: "故事",
      scenes: [], characters: [], props: [],
      storyboards: [{ plot: "镜头", sceneKey: "missing_scene" }],
    });
    assert.equal(result.valid, true);
  });

  it("returns invalid instead of throwing for malformed manifest fields", () => {
    assert.doesNotThrow(() => validateProductionManifest({}));
    const result = validateProductionManifest({
      schemaVersion: "creator-production.v1",
      project: { projectId: "project-1" },
      storyboards: {},
      characters: null,
      scenes: "invalid",
      props: [null],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("storyboards_invalid"));
    assert.ok(result.errors.includes("props_0_invalid"));
    assert.ok(result.errors.includes("source_kind_invalid"));
  });

  it("builds the manifest used by both adapter and HTTP preview paths", () => {
    const manifest = createProductionManifest(
      { projectId: "project-1" },
      {
        scriptText: "fallback",
        commitPayload: {
          scriptText: "场景：大厅。",
          scenes: [{ name: "大厅" }],
          characters: [],
          props: [],
          storyboards: [{ plot: "开场" }],
        },
      },
    );
    assert.equal(manifest.project.projectId, "project-1");
    assert.equal(manifest.source.kind, "script");
    assert.equal(manifest.scriptText, "场景：大厅。");
    assert.equal(manifest.source.contentHash?.length, 64);
    assert.equal(manifest.scenes[0]?.key, "scene_大厅");
    assert.equal(manifest.revision?.version, 1);
    assert.match(manifest.revision?.hash ?? "", /^sha256:[a-f0-9]{64}$/);
  });

  it("normalizes existing preview asset references to stable manifest keys", () => {
    const manifest = createProductionManifest(
      { projectId: "project-1" },
      {
        commitPayload: {
          scriptText: "场景：大厅。",
          scenes: [{ sceneId: "scene-source-1", sceneName: "大厅" }],
          characters: [{ characterId: "character-source-1", characterName: "主角" }],
          props: [{ propId: "prop-source-1", propName: "钥匙" }],
          storyboards: [{
            plot: "主角拿着钥匙进入大厅",
            sceneName: "大厅",
            characterIds: ["character-source-1"],
            props: "钥匙",
          }],
        },
      },
    );

    assert.equal(manifest.storyboards[0]?.sceneKey, "scene_大厅");
    assert.deepEqual(manifest.storyboards[0]?.characterKeys, ["character_主角"]);
    assert.deepEqual(manifest.storyboards[0]?.propKeys, ["prop_钥匙"]);
    assert.deepEqual(validateProductionManifest(manifest), { valid: true, errors: [] });
  });

  it("rejects a versioned manifest whose content no longer matches its hash", () => {
    const manifest = createProductionManifest(
      { projectId: "project-1" },
      { commitPayload: { scriptText: "原始剧本", scenes: [], characters: [], props: [], storyboards: [] } },
    );
    const result = validateProductionManifest({ ...manifest, scriptText: "已被旧页面覆盖的剧本" });

    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("manifest_hash_mismatch"));
  });

  it("requires every production asset to expose a stable key", () => {
    const result = validateProductionManifest({
      schemaVersion: "creator-production.v1",
      source: { kind: "script" },
      project: { projectId: "project-1" },
      scriptText: "场景：大厅。",
      scenes: [{ name: "大厅" }],
      characters: [],
      props: [],
      storyboards: [],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("scene_0_key_required"));
  });
});

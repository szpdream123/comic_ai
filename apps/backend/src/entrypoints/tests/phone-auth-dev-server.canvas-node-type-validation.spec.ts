import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { it } from "node:test";

import { grantCredits } from "../../modules/credit-billing/credit-ledger.service.ts";
import {
  createUserPasswordHash,
  defaultPasswordFromPhone,
} from "../../modules/identity/team-account-credentials.service.ts";
import { createPromptMarketplaceService } from "../../modules/prompt-marketplace/prompt-marketplace.service.ts";
import { upsertLibraryAssetWithVersion } from "../../modules/project/asset-library.service.ts";
import { createMigratedTestDb } from "../../modules/shared/db/test-db.ts";
import { createScopedStorageObject } from "../../modules/storage/storage.service.ts";
import { __phoneAuthDevServerTestUtils, createPhoneAuthDevServer } from "../phone-auth-dev-server.ts";

it("formats every Canvas animation action and frame grid as a Sprite Sheet prompt", () => {
  const actions = [
    ["idle", "待机"],
    ["walk", "行走"],
    ["run", "奔跑"],
    ["jump", "跳跃"],
    ["attack", "攻击"],
    ["hit", "受击"],
  ];
  const frameGrids = [
    [6, 3, 2, "3:2"],
    [8, 4, 2, "2:1"],
    [10, 5, 2, "21:9"],
    [12, 4, 3, "4:3"],
    [16, 4, 4, "1:1"],
    [20, 5, 4, "5:4"],
  ];

  for (const [action, label] of actions) {
    const prompt = __phoneAuthDevServerTestUtils.appendCanvasAnimationSpritePrompt("角色", {
      outputKind: "sprite-sheet",
      animationAction: action,
      animationFrames: 6,
    });
    assert.match(prompt, new RegExp(`Create one ${label} character animation Sprite Sheet with exactly 6 frames`));
    assert.match(prompt, /Reference image is authoritative/);
    assert.match(prompt, /If text conflicts, follow the reference/);
    assert.match(prompt, /change only pose and motion/);
  }
  for (const [frames, cols, rows, aspectRatio] of frameGrids) {
    const prompt = __phoneAuthDevServerTestUtils.appendCanvasAnimationSpritePrompt("角色", {
      outputKind: "sprite-sheet",
      animationAction: "run",
      animationFrames: frames,
    });
    assert.match(prompt, new RegExp(`${cols} column by ${rows} row grid in left-to-right, top-to-bottom playback order`));
    assert.match(prompt, new RegExp(`complete sheet aspect ratio is ${aspectRatio}`));
  }
  const upgradedLegacyPrompt = __phoneAuthDevServerTestUtils.appendCanvasAnimationSpritePrompt(
    "Create one 奔跑 character animation Sprite Sheet with exactly 6 frames.",
    { outputKind: "sprite-sheet", animationAction: "run", animationFrames: 6 },
  );
  assert.match(upgradedLegacyPrompt, /Reference image is authoritative/);
  assert.equal(upgradedLegacyPrompt.match(/character animation Sprite Sheet with exactly 6 frames/g)?.length, 1);
});

it("accepts Canvas image derivations and generators while rejecting non-generator nodes", async () => {
  const db = await createMigratedTestDb();
  let providerBody: Record<string, unknown> | null = null;
  const env = {
    NODE_ENV: "test",
    AUTH_SESSION_REDIS_CACHE_ENABLED: "false",
    BULLMQ_OUTBOX_DISPATCHER_ENABLED: "false",
    CUMOB_API_KEY: "test-cumob-key",
    GPT_IMAGE2_PROVIDER_ENABLED: "true",
  };
  const server = createPhoneAuthDevServer({
    db,
    env,
    fetchImpl: async (url, init) => {
      if (String(url).includes("api.cumob.com")) {
        providerBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
        return new Response(JSON.stringify({
          id: "mock-cumob-task",
          status: "succeeded",
          data: [{ url: "https://cdn.test/generated.png" }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(Buffer.from([0x89, 0x50, 0x4e, 0x47]), {
        status: 200,
        headers: { "content-type": "image/png" },
      });
    },
    repairScheduler: { enabled: false },
  });
  const userId = randomUUID();
  const phone = "13900000029";
  const libraryAssetId = randomUUID();
  const libraryAssetVersionId = randomUUID();
  const now = new Date("2026-07-29T03:00:00.000Z");

  try {
    await db.query(
      `
        INSERT INTO users (id, phone_e164, password_hash, status)
        VALUES ($1, $2, $3, 'active')
      `,
      [userId, phone, await createUserPasswordHash(defaultPasswordFromPhone(phone))],
    );
    await db.query(`
      INSERT INTO user_memberships
        (id,user_id,membership_tier,purchase_at,expires_at,gift_credits,status,created_at,updated_at)
      VALUES ($1,$2,'professional',$3,$4,0,'active',$3,$3)
    `, [randomUUID(), userId, now, new Date(Date.now() + 86_400_000)]);
    await grantCredits(db, {
      userId,
      amount: 5_000,
      sourceType: "test_credit_seed",
      sourceId: randomUUID(),
      reason: "Canvas node type validation",
      createdByUserId: userId,
      now,
    });
    const imageSkill = await createPromptMarketplaceService({ db }).createItem({
      userId,
      title: "画布生图技能",
      category: "image_style",
      content: "统一使用冷色电影光影。",
      priceCredits: 0,
      publish: true,
      now,
    });
    await upsertLibraryAssetWithVersion(db, {
      asset: {
        id: libraryAssetId,
        scope: "official",
        ownerUserId: null,
        createdByUserId: null,
        assetType: "character",
        category: "character",
        folder: "角色",
        name: "官方保姆",
        description: "亲切温和的保姆，现代生活职业形象",
        tags: [],
        status: "active",
        requiresProEntitlement: false,
        createdAt: now,
        updatedAt: now,
      },
      version: {
        id: libraryAssetVersionId,
        versionNumber: 1,
        storageObjectKey: "official/characters/nanny.png",
        previewUrl: "/assets/library/official/characters/nanny.png",
        mimeType: "image/png",
        width: 720,
        height: 960,
        metadata: {},
        createdAt: now,
      },
    });
    await server.listen(0);
    const loginResponse = await fetch(`${server.origin}/api/auth/password/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        account: phone,
        password: defaultPasswordFromPhone(phone),
      }),
    });
    assert.equal(loginResponse.status, 200);
    const cookie = loginResponse.headers.get("set-cookie") ?? "";

    const createResponse = await fetch(`${server.origin}/api/creator/canvas-projects`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-node-type-project-create",
        cookie,
      },
      body: JSON.stringify({ title: "节点类型校验画布" }),
    });
    const created = await createResponse.json();
    assert.equal(createResponse.status, 201, JSON.stringify(created));
    const canvasProjectId = created.data.project.id;

    const saveResponse = await fetch(`${server.origin}/api/creator/canvas-projects/${canvasProjectId}/canvas`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        clientRevision: 1,
        document: {
          version: 1,
          canvasProjectId,
          projectId: canvasProjectId,
          viewport: { x: 0, y: 0, zoom: 1 },
          nodes: [{
            id: "script-node",
            type: "script",
            position: { x: 100, y: 100 },
            data: {
              mediaKind: "text",
              text: "不能作为生成节点运行",
              ports: { inputs: [], outputs: [{ id: "out_text", kind: "text" }] },
            },
          }, {
            id: "source-image-node",
            type: "source-image",
            position: { x: 300, y: 100 },
            data: {
              mediaKind: "image",
              assetId: libraryAssetId,
              assetVersionId: libraryAssetVersionId,
              url: "https://cdn.test/source.png",
              ports: { inputs: [], outputs: [{ id: "out_image", kind: "image" }] },
            },
          }, {
            id: "upload-image-node",
            type: "upload",
            position: { x: 400, y: 300 },
            data: {
              mediaKind: "image",
              url: "https://cdn.test/upload.png",
              ports: { inputs: [], outputs: [{ id: "out_image", kind: "image" }] },
            },
          }, {
            id: "ai-image-node",
            type: "ai-image",
            position: { x: 500, y: 100 },
            data: {
              mediaKind: "image",
              modelCode: "cumob-gpt-image-2-pro",
              prompt: `@drama:${libraryAssetId}背景改为蓝色`,
              ports: { inputs: [], outputs: [{ id: "out_image", kind: "image" }] },
            },
          }, {
            id: "ai-video-node",
            type: "ai-video",
            position: { x: 900, y: 100 },
            data: {
              mediaKind: "video",
              modelCode: "sd_2.0_special",
              prompt: "游泳",
              videoGenerationMode: "reference-video",
              ports: { inputs: [{ id: "in_asset", kind: "asset" }], outputs: [{ id: "out_video", kind: "video" }] },
            },
          }, {
            id: "ai-animation-node",
            type: "ai-animation",
            position: { x: 1300, y: 100 },
            data: {
              mediaKind: "image",
              modelCode: "cumob-gpt-image-2-pro",
              prompt: "像素风红发剑士奔跑 Sprite Sheet",
              animationAction: "run",
              animationFrames: 6,
              ports: { inputs: [{ id: "in_asset", kind: "any" }], outputs: [{ id: "out_image", kind: "image" }] },
            },
          }, {
            id: "ai-panorama-node",
            type: "ai-panorama",
            position: { x: 1700, y: 100 },
            data: {
              mediaKind: "image",
              modelCode: "cumob-gpt-image-2-pro",
              prompt: "360 度城市全景",
              ports: { inputs: [{ id: "in_asset", kind: "any" }], outputs: [{ id: "out_image", kind: "image" }] },
            },
          }, {
            id: "ai-storyboard-node",
            type: "ai-storyboard",
            position: { x: 2100, y: 100 },
            data: {
              mediaKind: "image",
              modelCode: "cumob-gpt-image-2-pro",
              prompt: "六格动作分镜",
              ports: { inputs: [{ id: "in_asset", kind: "any" }], outputs: [{ id: "out_image", kind: "image" }] },
            },
          }],
          edges: [],
        },
        events: [],
      }),
    });
    assert.equal(saveResponse.status, 200, await saveResponse.text());
    const directorVideo = await createScopedStorageObject(db, {
      userId,
      bucket: "canvas-director-reference-test",
      objectName: "director-reference.mp4",
      contentType: "video/mp4",
      sizeBytes: 32,
      provider: "creator-dev",
      status: "available",
      createdByUserId: userId,
      now,
    });

    const imageResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-invalid-image-node",
        cookie,
      },
      body: JSON.stringify({
        target: { kind: "canvas", canvasProjectId, nodeId: "script-node" },
        prompt: "不应提交图片任务",
        model: "global-ai-opc-gpt-image-2",
      }),
    });
    const imagePayload = await imageResponse.json();
    assert.equal(imageResponse.status, 400, JSON.stringify(imagePayload));
    assert.equal(imagePayload.errorCode, "canvas_image_node_invalid");

    const videoResponse = await fetch(`${server.origin}/api/canvas/${canvasProjectId}/nodes/script-node/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-invalid-video-node",
        cookie,
      },
      body: JSON.stringify({
        kind: "video",
        prompt: "不应提交视频任务",
        model: "seedance-1.0-pro",
      }),
    });
    const videoPayload = await videoResponse.json();
    assert.equal(videoResponse.status, 400, JSON.stringify(videoPayload));
    assert.equal(videoPayload.errorCode, "canvas_video_node_invalid");

    const sideEffects = await db.query<{
      project_count: number;
      episode_count: number;
      run_count: number;
      task_count: number;
    }>(
      `
        SELECT
          (SELECT count(*)::int FROM projects) AS project_count,
          (SELECT count(*)::int FROM episodes) AS episode_count,
          (SELECT count(*)::int FROM creator_canvas_node_runs) AS run_count,
          (SELECT count(*)::int FROM tasks) AS task_count
      `,
    );
    assert.deepEqual(sideEffects.rows[0], {
      project_count: 0,
      episode_count: 0,
      run_count: 0,
      task_count: 0,
    });

    const sourceImageResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-source-image-derivation",
        cookie,
      },
      body: JSON.stringify({
        target: { kind: "canvas", canvasProjectId, nodeId: "source-image-node" },
        prompt: "裁剪",
        model: "cumob-gpt-image-2-pro",
        parameters: {
          derivationId: randomUUID(),
          referenceImages: ["https://cdn.test/source.png"],
          crop: { x: 10, y: 15, width: 70, height: 60 },
        },
      }),
    });
    const sourceImagePayload = await sourceImageResponse.json();
    assert.equal(sourceImageResponse.status, 200, JSON.stringify(sourceImagePayload));
    assert.ok(sourceImagePayload.data.taskId);

    const uploadImageResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-upload-image-node",
        cookie,
      },
      body: JSON.stringify({
        target: { kind: "canvas", canvasProjectId, nodeId: "upload-image-node" },
        prompt: "摄影棚灯光调整",
        model: "cumob-gpt-image-2-pro",
        parameters: { referenceImages: ["https://cdn.test/upload.png"] },
      }),
    });
    const uploadImagePayload = await uploadImageResponse.json();
    assert.equal(uploadImageResponse.status, 200, JSON.stringify(uploadImagePayload));
    assert.ok(uploadImagePayload.data.taskId);

    const acceptedResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-ai-image-node",
        cookie,
      },
      body: JSON.stringify({
        target: { kind: "canvas", canvasProjectId, nodeId: "ai-image-node" },
        prompt: `@drama:${libraryAssetId}背景改为蓝色`,
        skill: { id: imageSkill.item.id, category: "image_style" },
        model: "cumob-gpt-image-2-pro",
        parameters: { quality: "1K", aspectRatio: "1:1" },
      }),
    });
    const acceptedPayload = await acceptedResponse.json();
    assert.equal(acceptedResponse.status, 200, JSON.stringify(acceptedPayload));
    assert.ok(acceptedPayload.data.taskId);

    const generated = await db.query<{
      input_snapshot_json: Record<string, unknown>;
      provider_count: number;
    }>(`
      SELECT task.input_snapshot_json,
             (SELECT count(*)::int FROM provider_requests request WHERE request.task_id=task.id) AS provider_count
      FROM tasks task
      WHERE task.id=$1
    `, [acceptedPayload.data.taskId]);
    const snapshot = generated.rows[0]?.input_snapshot_json;
    assert.match(String(snapshot?.prompt), /^统一使用冷色电影光影。/);
    assert.equal((snapshot?.promptSkill as Record<string, unknown> | undefined)?.id, imageSkill.item.id);
    assert.match(String(snapshot?.prompt), /亲切温和的保姆/);
    assert.doesNotMatch(String(snapshot?.prompt), /@drama:/);
    assert.equal(JSON.stringify(snapshot).includes("/assets/library/official/characters/nanny.png"), false);
    assert.equal(generated.rows[0]?.provider_count, 1);
    assert.match(String(providerBody?.prompt), /^统一使用冷色电影光影。/);
    assert.match(String(providerBody?.prompt), /亲切温和的保姆/);
    assert.equal(JSON.stringify(providerBody).includes("/assets/library/official/characters/nanny.png"), false);
    assert.equal(providerBody?.images, undefined);

    const acceptedAnimationResponse = await fetch(`${server.origin}/api/generation/image-tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "canvas-ai-animation-node",
        cookie,
      },
      body: JSON.stringify({
        target: { kind: "canvas", canvasProjectId, nodeId: "ai-animation-node" },
        prompt: "像素风红发剑士奔跑 Sprite Sheet",
        model: "cumob-gpt-image-2-pro",
        parameters: {
          quality: "1K",
          aspectRatio: "3:2",
          animationAction: "run",
          animationFrames: 6,
          animationGrid: { cols: 3, rows: 2 },
          outputKind: "sprite-sheet",
        },
      }),
    });
    const acceptedAnimationPayload = await acceptedAnimationResponse.json();
    assert.equal(acceptedAnimationResponse.status, 200, JSON.stringify(acceptedAnimationPayload));
    assert.ok(acceptedAnimationPayload.data.taskId);
    assert.match(String(providerBody?.prompt), /奔跑 character animation Sprite Sheet with exactly 6 frames/);
    assert.match(String(providerBody?.prompt), /3 column by 2 row grid in left-to-right, top-to-bottom playback order/);
    assert.match(String(providerBody?.prompt), /Reference image is authoritative/);
    assert.match(String(providerBody?.prompt), /If text conflicts, follow the reference/);
    assert.match(String(providerBody?.prompt), /filling most of the cell with only small consistent margins/);

    for (const [nodeId, prompt] of [
      ["ai-panorama-node", "360 度城市全景"],
      ["ai-storyboard-node", "六格动作分镜"],
    ]) {
      const response = await fetch(`${server.origin}/api/generation/image-tasks`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": `canvas-${nodeId}`,
          cookie,
        },
        body: JSON.stringify({
          target: { kind: "canvas", canvasProjectId, nodeId },
          prompt,
          model: "cumob-gpt-image-2-pro",
          parameters: { quality: "1K", aspectRatio: "3:2" },
        }),
      });
      const payload = await response.json();
      assert.equal(response.status, 200, JSON.stringify(payload));
      assert.ok(payload.data.taskId);
    }

    const videoServer = createPhoneAuthDevServer({
      db: {
        query: db.query.bind(db),
        close: async () => undefined,
      },
      env: { ...env, BULLMQ_OUTBOX_DISPATCHER_ENABLED: "true" },
      repairScheduler: { enabled: false },
    });
    await videoServer.listen(0);
    let acceptedVideoPayload: Record<string, unknown>;
    try {
      const acceptedVideoResponse = await fetch(`${videoServer.origin}/api/canvas/${canvasProjectId}/nodes/ai-video-node/run`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": "canvas-ai-video-node",
          cookie,
        },
        body: JSON.stringify({
          kind: "video",
          mediaKind: "video",
          prompt: "游泳",
          skill: { id: imageSkill.item.id, category: "image_style" },
          model: "sd_2.0_special",
          estimatedCredits: 3_250,
          parameters: {
            mode: "reference-video",
            resolution: "720p",
            durationSec: 5,
            aspectRatio: "16:9",
            referenceImages: [{ url: "https://cdn.test/reference.png" }],
            referenceVideos: [{
              storageObjectId: directorVideo.id,
              url: `/api/storage/objects/${directorVideo.id}/content`,
            }],
          },
        }),
      });
      acceptedVideoPayload = await acceptedVideoResponse.json();
      assert.equal(acceptedVideoResponse.status, 200, JSON.stringify(acceptedVideoPayload));
    } finally {
      await videoServer.close();
    }
    const acceptedVideoRun = await db.query<{
      task_id: string | null;
      status: string;
      input_snapshot_json: Record<string, unknown>;
    }>(`
      SELECT run.task_id, run.status, task.input_snapshot_json
      FROM creator_canvas_node_runs run
      LEFT JOIN tasks task ON task.id=run.task_id
      WHERE run.canvas_project_id=$1 AND run.node_key='ai-video-node'
    `, [canvasProjectId]);
    assert.equal(acceptedVideoRun.rows.length, 1, JSON.stringify(acceptedVideoPayload));
    assert.ok(acceptedVideoRun.rows[0]?.task_id, JSON.stringify(acceptedVideoPayload));
    assert.match(String(acceptedVideoRun.rows[0]?.input_snapshot_json.prompt), /^统一使用冷色电影光影。/);
    assert.equal(
      (acceptedVideoRun.rows[0]?.input_snapshot_json.promptSkill as Record<string, unknown> | undefined)?.id,
      imageSkill.item.id,
    );
  } finally {
    await server.close();
  }
});

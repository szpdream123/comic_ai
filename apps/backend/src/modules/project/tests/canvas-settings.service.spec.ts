import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { CanvasAuthorizationError, type CanvasActorScope } from "../../identity/canvas-actor-scope.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  CanvasSettingsError,
  createCanvasPromptSuffixDirective,
  getCanvasSettings,
  updateCanvasSettings,
} from "../canvas-settings.service.ts";

const settingsMigration = readFileSync(
  "packages/db/migrations/20260802-canvas-settings.sql",
  "utf8",
);

describe("Canvas settings service", { concurrency: false }, () => {
  it("persists validated settings with an independent optimistic revision and member audit principal", async () => {
    const db = await createMigratedTestDb();
    const ownerUserId = randomUUID();
    const memberId = randomUUID();
    const canvasId = randomUUID();
    const now = new Date("2026-07-25T10:00:00.000Z");
    try {
      await db.query(settingsMigration);
      await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [ownerUserId]);
      await db.query(`
        INSERT INTO team_members (
          id,user_id,member_account,member_account_suffix,member_login_account,
          member_name,member_password_hash,member_credits,status
        ) VALUES ($1,$2,'settings-member','settings','settings-member@settings','Settings Member','hash',0,'active')
      `, [memberId, ownerUserId]);
      await db.query(`
        INSERT INTO creator_canvas_projects
          (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
        VALUES ($1,'Settings Canvas','active',1,$2,$2)
      `, [canvasId, ownerUserId]);
      const ownerScope = scope({ canvasId, ownerUserId });
      const memberScope = scope({ canvasId, ownerUserId, memberId });

      const initial = await getCanvasSettings(db, { actorScope: ownerScope });
      assert.equal(initial.revision, 1);
      assert.deepEqual(initial.settings.appearance, {
        mascotEnabled: true,
        mascotPosition: null,
        canvasBackground: "default",
        customBackgroundStorageObjectId: null,
        customBackgroundOpacity: 0.3,
        customBackgroundIsDark: null,
      });
      assert.equal(initial.limits.document.maximumNodes, 2_000);
      assert.equal(initial.limits.generation.maximumBatchNodes, 100);
      assert.equal(initial.settings.defaultModels.image, null);
      assert.equal(initial.settings.visualStyle.styleReferenceEnabled, true);
      assert.equal(initial.settings.generation.imageAspectRatio, "1:1");

      const assetId = randomUUID();
      const updated = await updateCanvasSettings(db, {
        actorScope: memberScope,
        expectedRevision: 1,
        patch: {
          appearance: {
            mascotEnabled: true,
            mascotPosition: { x: 0.25, y: 0.75 },
            canvasBackground: "custom",
            customBackgroundStorageObjectId: assetId,
            customBackgroundOpacity: 0.45,
            customBackgroundIsDark: false,
          },
          visualStyle: {
            styleId: "style-version-3",
            prompt: "cinematic ink wash",
            locked: true,
            styleReferenceAssetId: assetId,
            styleReferenceEnabled: false,
          },
          promptSuffixes: { image: "high detail, clean silhouette" },
          defaultModels: { image: "gpt-image-2-cn" },
          generation: {
            imageAspectRatio: "9:16",
            imageSize: "2K",
            imageFollowNode: true,
            videoResolution: "1080p",
            videoDuration: 8,
            videoFollowNode: true,
          },
        },
        now,
      });

      assert.equal(updated.revision, 2);
      assert.equal(updated.updatedByPrincipalKey, `member:${memberId}`);
      assert.equal(updated.updatedByTeamMemberId, memberId);
      assert.equal(updated.settings.visualStyle.styleReferenceAssetId, assetId);
      assert.equal(updated.settings.visualStyle.styleReferenceEnabled, false);
      assert.deepEqual(updated.settings.appearance.mascotPosition, { x: 0.25, y: 0.75 });
      assert.equal(updated.settings.appearance.canvasBackground, "custom");
      assert.equal(updated.settings.appearance.customBackgroundStorageObjectId, assetId);
      assert.equal(updated.settings.appearance.customBackgroundOpacity, 0.45);
      assert.equal(updated.settings.appearance.customBackgroundIsDark, false);
      assert.equal(updated.settings.promptSuffixes.text, "");
      assert.equal(updated.settings.promptSuffixes.image, "high detail, clean silhouette");
      assert.equal(updated.settings.defaultModels.image, "gpt-image-2-cn");
      assert.equal(updated.settings.generation.imageFollowNode, true);
      assert.equal(updated.settings.generation.videoDuration, 8);
      assert.equal(updated.settings.generation.videoFollowNode, true);
      const suffix = createCanvasPromptSuffixDirective(updated, "image");
      assert.equal(suffix?.id, canvasId);
      assert.equal(suffix?.version, "2");
      assert.match(suffix?.contentHash ?? "", /^[a-f0-9]{64}$/);

      await assert.rejects(
        updateCanvasSettings(db, {
          actorScope: ownerScope,
          expectedRevision: 1,
          patch: { promptSuffixes: { image: "stale write" } },
          now,
        }),
        (error: unknown) => error instanceof CanvasSettingsError
          && error.code === "canvas_settings_revision_conflict",
      );
      await assert.rejects(
        updateCanvasSettings(db, {
          actorScope: ownerScope,
          expectedRevision: 2,
          patch: { appearance: { mascotPosition: { x: 1.2, y: 0.5 } } },
          now: new Date(),
        }),
        (error: unknown) => error instanceof CanvasSettingsError
          && error.code === "canvas_settings_mascot_position_invalid",
      );
      const row = await db.query<{ server_revision: number; settings_revision: number }>(
        "SELECT server_revision,settings_revision FROM creator_canvas_projects WHERE id=$1",
        [canvasId],
      );
      assert.equal(Number(row.rows[0]?.server_revision), 1);
      assert.equal(Number(row.rows[0]?.settings_revision), 2);
    } finally {
      await db.close();
    }
  });

  it("rejects unknown fields, invalid stable references, and scopes without edit capability", async () => {
    const db = await createMigratedTestDb();
    const ownerUserId = randomUUID();
    const canvasId = randomUUID();
    try {
      await db.query(settingsMigration);
      await db.query("INSERT INTO users (id,status) VALUES ($1,'active')", [ownerUserId]);
      await db.query(`
        INSERT INTO creator_canvas_projects
          (id,title,status,server_revision,created_by_user_id,updated_by_user_id)
        VALUES ($1,'Settings validation','active',1,$2,$2)
      `, [canvasId, ownerUserId]);
      const ownerScope = scope({ canvasId, ownerUserId });
      await assert.rejects(
        updateCanvasSettings(db, {
          actorScope: ownerScope,
          expectedRevision: 1,
          patch: { defaultModels: { image: "model by display name with spaces" } },
          now: new Date(),
        }),
        (error: unknown) => error instanceof CanvasSettingsError
          && error.code === "canvas_settings_model_invalid",
      );
      await assert.rejects(
        updateCanvasSettings(db, {
          actorScope: ownerScope,
          expectedRevision: 1,
          patch: { visualStyle: { styleReferenceEnabled: "yes" } } as never,
          now: new Date(),
        }),
        (error: unknown) => error instanceof CanvasSettingsError
          && error.code === "canvas_settings_style_reference_enabled_invalid",
      );
      await assert.rejects(
        updateCanvasSettings(db, {
          actorScope: ownerScope,
          expectedRevision: 1,
          patch: { visualStyle: { prompt: "valid", apiKey: "forbidden" } } as never,
          now: new Date(),
        }),
        (error: unknown) => error instanceof CanvasSettingsError
          && error.code === "canvas_settings_field_invalid",
      );
      await assert.rejects(
        updateCanvasSettings(db, {
          actorScope: ownerScope,
          expectedRevision: 1,
          patch: { generation: { imageFollowNode: "yes" } } as never,
          now: new Date(),
        }),
        (error: unknown) => error instanceof CanvasSettingsError
          && error.code === "canvas_settings_generation_follow_node_invalid",
      );
      await assert.rejects(
        updateCanvasSettings(db, {
          actorScope: { ...ownerScope, capabilities: [capabilities.canvasView] },
          expectedRevision: 1,
          patch: {},
          now: new Date(),
        }),
        (error: unknown) => error instanceof CanvasAuthorizationError
          && error.code === "capability_missing",
      );
    } finally {
      await db.close();
    }
  });
});

function scope(input: { canvasId: string; ownerUserId: string; memberId?: string }): CanvasActorScope {
  return input.memberId
    ? {
        canvasId: input.canvasId,
        ownerUserId: input.ownerUserId,
        principal: "team_member",
        actorTeamMemberId: input.memberId,
        principalKey: `member:${input.memberId}`,
        capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun],
      }
    : {
        canvasId: input.canvasId,
        ownerUserId: input.ownerUserId,
        principal: "owner",
        actorTeamMemberId: null,
        principalKey: `owner:${input.ownerUserId}`,
        capabilities: [capabilities.canvasView, capabilities.canvasEdit, capabilities.canvasRun, capabilities.canvasManage],
      };
}

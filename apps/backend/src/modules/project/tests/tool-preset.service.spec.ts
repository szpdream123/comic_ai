import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { runWithDatabaseContext } from "../../shared/db/dev-db.ts";
import { createMigratedTestDb, listIndexNames, listTableNames } from "../../shared/db/test-db.ts";
import {
  ToolPresetError,
  archiveToolPreset,
  createToolPreset,
  duplicateToolPreset,
  getToolPreset,
  getToolPresetVersion,
  listToolPresets,
  listToolPresetVersions,
  normalizeToolPresetTopology,
  updateToolPreset,
} from "../tool-preset.service.ts";

const mainUserId = "00000000-0000-4000-8000-000000000891";
const otherUserId = "00000000-0000-4000-8000-000000000892";
const memberId = "10000000-0000-4000-8000-000000000891";

const scriptToImage = {
  schemaVersion: 1,
  nodes: [
    { kind: "workflow", type: "script-node", offsetX: 0, offsetY: 20, data: { title: "脚本", text: "开场" } },
    { kind: "image", offsetX: 420, offsetY: 0, data: { title: "图片", model: "image-model", parameters: { count: 1 } } },
  ],
  connections: [[0, 1]],
};

describe("tool preset service", { concurrency: false }, () => {
  it("versions, duplicates, shares, isolates and soft-deletes presets", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      const created = await createToolPreset(db, {
        adminUserId: mainUserId,
        createdByMemberId: memberId,
        name: "脚本生图工具",
        description: "共享工作流",
        category: "image",
        topology: scriptToImage,
      });
      assert.equal(created.currentVersionNumber, 1);
      assert.equal(created.currentVersion.createdByMemberId, memberId);
      assert.equal(created.currentVersion.nodeCount, 2);
      assert.equal(created.currentVersion.edgeCount, 1);
      assert.deepEqual((await listToolPresets(db, { adminUserId: mainUserId })).map((item) => item.id), [created.id]);
      assert.deepEqual(await listToolPresets(db, { adminUserId: otherUserId }), []);
      await assert.rejects(
        getToolPreset(db, { adminUserId: otherUserId, presetId: created.id }),
        (error: unknown) => error instanceof ToolPresetError && error.code === "tool_preset_not_found",
      );

      const metadataUpdate = await updateToolPreset(db, {
        adminUserId: mainUserId,
        createdByMemberId: memberId,
        presetId: created.id,
        name: "脚本生图工具 V2",
      });
      assert.equal(metadataUpdate.currentVersionNumber, 1);
      assert.equal(metadataUpdate.currentVersion.contentHash, created.currentVersion.contentHash);

      const updated = await updateToolPreset(db, {
        adminUserId: mainUserId,
        presetId: created.id,
        expectedVersionNumber: 1,
        topology: {
          schemaVersion: 1,
          nodes: [
            { kind: "workflow", type: "director-node", offsetX: 0, offsetY: 0 },
            { kind: "image", offsetX: 440, offsetY: 0 },
            { kind: "video", offsetX: 900, offsetY: 0 },
          ],
          connections: [[0, 1], [1, 2]],
        },
      });
      assert.equal(updated.currentVersionNumber, 2);
      assert.notEqual(updated.currentVersion.contentHash, created.currentVersion.contentHash);
      assert.deepEqual((await listToolPresetVersions(db, {
        adminUserId: mainUserId,
        presetId: created.id,
      })).map((version) => version.versionNumber), [2, 1]);
      assert.deepEqual(
        (await getToolPresetVersion(db, {
          adminUserId: mainUserId,
          presetId: created.id,
          versionNumber: 1,
        })).topology,
        normalizeToolPresetTopology(scriptToImage),
      );

      const duplicate = await duplicateToolPreset(db, {
        adminUserId: mainUserId,
        createdByMemberId: memberId,
        presetId: created.id,
        name: "脚本生图工具副本",
      });
      assert.equal(duplicate.currentVersionNumber, 1);
      assert.equal(duplicate.currentVersion.contentHash, updated.currentVersion.contentHash);
      assert.notEqual(duplicate.id, created.id);

      assert.deepEqual(await archiveToolPreset(db, { adminUserId: mainUserId, presetId: created.id }), { deleted: true });
      assert.deepEqual((await listToolPresets(db, { adminUserId: mainUserId })).map((item) => item.id), [duplicate.id]);
      const archived = await listToolPresets(db, { adminUserId: mainUserId, includeArchived: true });
      assert.equal(archived.find((item) => item.id === created.id)?.status, "archived");

      const tables = await listTableNames(db);
      assert.ok(tables.includes("creator_tool_presets"));
      assert.ok(tables.includes("creator_tool_preset_versions"));
      assert.ok((await listIndexNames(db, "creator_tool_presets")).includes("creator_tool_presets_admin_name_uidx"));
      assert.ok((await listIndexNames(db, "creator_tool_preset_versions")).includes("creator_tool_preset_versions_preset_created_idx"));
      const presetConstraints = await db.query<{ conname: string; condeferrable: boolean; condeferred: boolean }>(
        `
          SELECT conname, condeferrable, condeferred
          FROM pg_constraint
          WHERE conrelid IN (
            'creator_tool_presets'::regclass,
            'creator_tool_preset_versions'::regclass
          )
        `,
      );
      assert.ok(presetConstraints.rows.some((constraint) => (
        constraint.conname === "creator_tool_preset_versions_topology_check"
      )));
      assert.ok(presetConstraints.rows.some((constraint) => (
        constraint.conname === "creator_tool_preset_versions_hash_check"
      )));
      assert.ok(presetConstraints.rows.some((constraint) => (
        constraint.conname === "creator_tool_presets_current_version_fkey"
        && constraint.condeferrable
        && constraint.condeferred
      )));
    } finally {
      await db.close();
    }
  });

  it("rejects non-canonical nodes, media/runtime data and invalid typed graphs", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      await createToolPreset(db, { adminUserId: mainUserId, name: "唯一名称", topology: scriptToImage });
      await assert.rejects(
        createToolPreset(db, { adminUserId: mainUserId, name: " 唯一名称 ", topology: scriptToImage }),
        (error: unknown) => error instanceof ToolPresetError && error.code === "tool_preset_name_conflict",
      );
      for (const topology of [
        {
          schemaVersion: 1,
          nodes: [{ kind: "upload", offsetX: 0, offsetY: 0 }],
          connections: [],
        },
        {
          schemaVersion: 1,
          nodes: [{ id: "excalidraw-id", kind: "image", offsetX: 0, offsetY: 0 }],
          connections: [],
        },
        {
          schemaVersion: 1,
          nodes: [{ kind: "image", offsetX: 0, offsetY: 0, data: { storageObjectId: "00000000-0000-4000-8000-000000000001" } }],
          connections: [],
        },
        {
          schemaVersion: 1,
          nodes: [{ kind: "image", offsetX: 0, offsetY: 0, data: { parameters: { signedUrl: "https://example.invalid/file.png" } } }],
          connections: [],
        },
        {
          schemaVersion: 1,
          nodes: [{ kind: "video", offsetX: 0, offsetY: 0, data: { parameters: { resultStorageObjectId: "00000000-0000-4000-8000-000000000001" } } }],
          connections: [],
        },
        {
          schemaVersion: 1,
          nodes: [
            { kind: "image", offsetX: 0, offsetY: 0 },
            { kind: "workflow", type: "audio-node", offsetX: 400, offsetY: 0 },
          ],
          connections: [[0, 1]],
        },
        {
          schemaVersion: 1,
          nodes: [
            { kind: "workflow", type: "director-node", offsetX: 0, offsetY: 0 },
            { kind: "image", offsetX: 400, offsetY: 0 },
          ],
          connections: [[0, 1], [1, 0]],
        },
      ]) {
        await assert.rejects(
          createToolPreset(db, { adminUserId: mainUserId, name: `拒绝-${Math.random()}`, topology }),
          (error: unknown) => error instanceof ToolPresetError && error.code === "invalid_tool_preset_topology",
        );
      }
      await assert.rejects(
        updateToolPreset(db, { adminUserId: mainUserId, presetId: (await listToolPresets(db, { adminUserId: mainUserId }))[0]!.id }),
        (error: unknown) => error instanceof ToolPresetError && error.code === "invalid_tool_preset_update",
      );
    } finally {
      await db.close();
    }
  });

  it("allows one concurrent topology CAS update and rejects the stale writer", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      const created = await createToolPreset(db, {
        adminUserId: mainUserId,
        name: "并发版本",
        topology: scriptToImage,
      });
      const results = await Promise.allSettled([
        runWithDatabaseContext(() => updateToolPreset(db, {
          adminUserId: mainUserId,
          presetId: created.id,
          expectedVersionNumber: 1,
          topology: scriptToImage,
        })),
        runWithDatabaseContext(() => updateToolPreset(db, {
          adminUserId: mainUserId,
          presetId: created.id,
          expectedVersionNumber: 1,
          topology: {
            ...scriptToImage,
            nodes: scriptToImage.nodes.map((node, index) => index === 0
              ? { ...node, data: { ...node.data, text: "并发更新 B" } }
              : node),
          },
        })),
      ]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      assert.ok(rejected.reason instanceof ToolPresetError);
      assert.equal(rejected.reason.code, "tool_preset_version_conflict");
      assert.equal(rejected.reason.currentVersionNumber, 2);
      assert.equal((await getToolPreset(db, {
        adminUserId: mainUserId,
        presetId: created.id,
      })).currentVersionNumber, 2);
      assert.deepEqual((await listToolPresetVersions(db, {
        adminUserId: mainUserId,
        presetId: created.id,
      })).map((version) => version.versionNumber), [2, 1]);
    } finally {
      await db.close();
    }
  });
});

async function seedUsers(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138891', 'active'), ($2, '13800138892', 'active')",
    [mainUserId, otherUserId],
  );
  await db.query(
    `
      INSERT INTO team_members
        (id, user_id, member_account, member_account_suffix, member_login_account, member_name, member_password_hash, status)
      VALUES ($1, $2, 'toolmember', 'u138891', 'toolmember@u138891', 'Tool 成员', 'unused', 'active')
    `,
    [memberId, mainUserId],
  );
}

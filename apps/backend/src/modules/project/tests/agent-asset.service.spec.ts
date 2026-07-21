import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb, listIndexNames } from "../../shared/db/test-db.ts";
import {
  AgentAssetError,
  archiveAgentAsset,
  createAgentAsset,
  listAgentAssets,
  updateAgentAsset,
} from "../agent-asset.service.ts";

const mainUserId = "00000000-0000-4000-8000-000000000881";
const otherUserId = "00000000-0000-4000-8000-000000000882";
const memberId = "10000000-0000-4000-8000-000000000881";

describe("agent asset service", { concurrency: false }, () => {
  it("persists a shared main-account collection while rejecting cross-account access", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      const created = await createAgentAsset(db, {
        adminUserId: mainUserId,
        createdByMemberId: memberId,
        name: "悬疑导演",
        description: "保持视觉连续性",
        instructions: "低机位推进，不要跳轴",
      });
      assert.equal(created.adminUserId, mainUserId);
      assert.equal(created.createdByMemberId, memberId);
      assert.equal(created.agentType, "director");

      const memberVisible = await listAgentAssets(db, { adminUserId: mainUserId });
      assert.deepEqual(memberVisible.map((asset) => asset.id), [created.id]);
      assert.deepEqual(await listAgentAssets(db, { adminUserId: otherUserId }), []);

      const updated = await updateAgentAsset(db, {
        adminUserId: mainUserId,
        assetId: created.id,
        name: "悬疑长镜头导演",
        instructions: "长镜头推进，保持轴线",
      });
      assert.equal(updated.name, "悬疑长镜头导演");
      await assert.rejects(
        updateAgentAsset(db, { adminUserId: otherUserId, assetId: created.id, name: "越权修改" }),
        (error: unknown) => error instanceof AgentAssetError && error.code === "agent_asset_not_found",
      );

      assert.deepEqual(await archiveAgentAsset(db, { adminUserId: mainUserId, assetId: created.id }), { deleted: true });
      assert.deepEqual(await listAgentAssets(db, { adminUserId: mainUserId }), []);
      assert.equal((await listAgentAssets(db, { adminUserId: mainUserId, includeArchived: true }))[0]?.status, "archived");
    } finally {
      await db.close();
    }
  });

  it("enforces unique names and bounded persisted text", async () => {
    const db = await createMigratedTestDb();
    try {
      await seedUsers(db);
      await createAgentAsset(db, { adminUserId: mainUserId, name: "导演 Agent" });
      await assert.rejects(
        createAgentAsset(db, { adminUserId: mainUserId, name: "  导演 Agent  " }),
        (error: unknown) => error instanceof AgentAssetError && error.code === "agent_asset_name_conflict",
      );
      await assert.rejects(
        createAgentAsset(db, { adminUserId: mainUserId, name: "描述过长", description: "x".repeat(1001) }),
        (error: unknown) => error instanceof AgentAssetError && error.code === "invalid_agent_asset_description",
      );
      await assert.rejects(
        createAgentAsset(db, { adminUserId: mainUserId, name: "指令过长", instructions: "x".repeat(20_001) }),
        (error: unknown) => error instanceof AgentAssetError && error.code === "invalid_agent_asset_instructions",
      );
      await assert.rejects(
        updateAgentAsset(db, { adminUserId: mainUserId, assetId: "not-a-uuid", name: "无效" }),
        (error: unknown) => error instanceof AgentAssetError && error.code === "invalid_agent_asset_id",
      );
      const indexes = await listIndexNames(db, "creator_agent_assets");
      assert.ok(indexes.includes("creator_agent_assets_admin_updated_idx"));
      assert.ok(indexes.includes("creator_agent_assets_admin_name_uidx"));
    } finally {
      await db.close();
    }
  });
});

async function seedUsers(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  await db.query("INSERT INTO users (id, phone_e164, status) VALUES ($1, '13800138881', 'active'), ($2, '13800138882', 'active')", [mainUserId, otherUserId]);
  await db.query(
    `
      INSERT INTO team_members
        (id, user_id, member_account, member_account_suffix, member_login_account, member_name, member_password_hash, status)
      VALUES ($1, $2, 'agentmember', 'u138881', 'agentmember@u138881', 'Agent 成员', 'unused', 'active')
    `,
    [memberId, mainUserId],
  );
}

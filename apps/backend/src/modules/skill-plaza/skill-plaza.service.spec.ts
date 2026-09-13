import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { createSkillPlazaService, SkillPlazaError } from "./skill-plaza.service.ts";

describe("skill plaza admin review", { concurrency: false }, () => {
  it("requires review comments for approve and reject, then exposes them on mine/detail", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "91000000-0000-4000-8000-000000000001";
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800139001', 'Skill 作者', 'plain:test-password', 'active')`,
        [userId],
      );
      const service = createSkillPlazaService({ db });
      const created = await service.create({
        userId,
        name: "通用小说一键转分镜提取",
        summary: "一键生成工作流",
        category: "general",
        detail: {
          introduction: "# SKILL.md\n\n把小说转成分镜。",
          usageScene: "小说转分镜",
          howToUse: "输入小说正文",
          outputContent: "分镜表",
        },
      });
      assert.equal(created.status, "draft");

      await assert.rejects(
        () => service.updateStatus({ skillId: String(created.id), status: "published" }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_review_comment_required",
      );
      await assert.rejects(
        () => service.updateStatus({ skillId: String(created.id), status: "rejected" }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_review_comment_required",
      );

      const rejected = await service.updateStatus({
        skillId: String(created.id),
        status: "rejected",
        reviewComment: "内容不完整，请补充 SKILL.md",
      });
      assert.equal(rejected.status, "rejected");
      assert.equal(rejected.reviewComment, "内容不完整，请补充 SKILL.md");

      const approved = await service.updateStatus({
        skillId: String(created.id),
        status: "published",
        reviewComment: "内容完整，允许上架",
      });
      assert.equal(approved.status, "published");
      assert.equal(approved.reviewComment, "内容完整，允许上架");

      const mine = await service.listMine(userId);
      assert.equal(mine.items[0]?.reviewComment, "内容完整，允许上架");
      const detail = await service.getDetail({ skillId: String(created.id), userId });
      assert.equal(detail.skill.reviewComment, "内容完整，允许上架");
      const adminDetail = await service.getAdminDetail(String(created.id));
      assert.equal(adminDetail.skill.ownerName, "Skill 作者");
      assert.equal(adminDetail.skill.reviewComment, "内容完整，允许上架");

      const edited = await service.updateMine({
        userId,
        skillId: String(created.id),
        name: "通用小说一键转分镜提取",
        summary: "补充后重新送审",
        category: "general",
        detail: {
          introduction: "# SKILL.md\n\n补充内容。",
          usageScene: "小说转分镜",
          howToUse: "输入小说正文",
          outputContent: "分镜表",
        },
      });
      assert.equal(edited.status, "draft");
      assert.equal(edited.visibility, "private");
      assert.equal(edited.summary, "补充后重新送审");
    } finally {
      await db.close();
    }
  });

  it("creates official skills with the same content fields as the frontend create form", async () => {
    const db = await createMigratedTestDb();
    try {
      const service = createSkillPlazaService({ db });
      const created = await service.createOfficial({
        name: "官方短剧分镜导演",
        summary: "把剧本拆成镜头表",
        category: "short-drama",
        status: "published",
        files: [{ name: "SKILL.md", kind: "instruction", content: "## 做什么\n拆分镜头" }],
        detail: {
          introduction: "## 做什么\n拆分镜头",
          usageScene: "短剧分镜",
          howToUse: "输入剧本",
          outputContent: "镜头表",
        },
      });
      assert.equal(created.authorName, "官方");
      assert.equal(created.detail.howToUse, "输入剧本");
      const admin = await service.listAdmin({ status: "published", query: "官方短剧" });
      assert.equal(admin.items[0]?.fileCount, 1);
      const detail = await service.getAdminDetail(String(created.id));
      assert.equal(detail.files[0]?.name, "SKILL.md");
      assert.equal(detail.files[0]?.content, "## 做什么\n拆分镜头");
    } finally {
      await db.close();
    }
  });

  it("persists nested uploaded files onto the skill so admin fileCount is not zero", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "91000000-0000-4000-8000-000000000002";
      const storageObjectId = "94000000-0000-4000-8000-000000000001";
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800139002', 'Skill 作者', 'plain:test-password', 'active')`,
        [userId],
      );
      await db.query(
        `INSERT INTO storage_objects (
           id, bucket, object_key, content_type, size_bytes, metadata_json,
           created_by_user_id, provider, status
         ) VALUES ($1, 'creator-dev', 'skill-files/character-extract.md', 'text/markdown', 32, '{}'::jsonb, $2, 'creator-dev', 'available')`,
        [storageObjectId, userId],
      );
      const service = createSkillPlazaService({
        db,
        readSkillFileContent: async (id) => id === storageObjectId ? "角色提取正文 from COS" : null,
      });
      const created = await service.create({
        userId,
        name: "通用小说一键转分镜提取",
        summary: "一键生成工作流",
        category: "general",
        detail: {
          introduction: "# SKILL.md",
          usageScene: "小说转分镜",
          howToUse: "输入小说",
          outputContent: "分镜表",
          files: [
            { name: "SKILL.md", kind: "instruction", content: "---\nname: short-drama-pipeline\n---\n# 短剧流水线" },
            { name: "references/genre-packs.md", kind: "instruction", content: "题材包正文" },
          ],
        },
      });
      await service.attachFile({
        userId,
        skillId: String(created.id),
        storageObjectId,
        fileName: "references/character-extract.md",
        fileKind: "instruction",
      });
      const admin = await service.listAdmin({ query: "通用小说一键转分镜提取" });
      assert.equal(admin.items[0]?.fileCount, 2);
      const detail = await service.getAdminDetail(String(created.id));
      assert.equal(detail.files.map((file) => file.name).sort().join(","), "SKILL.md,references/character-extract.md,references/genre-packs.md");
      assert.equal(detail.files.find((file) => file.name === "SKILL.md")?.content, "---\nname: short-drama-pipeline\n---\n# 短剧流水线");
      assert.equal(detail.files.find((file) => file.name === "references/character-extract.md")?.content, "角色提取正文 from COS");
      assert.equal(detail.files.find((file) => file.name === "references/genre-packs.md")?.content, "题材包正文");
    } finally {
      await db.close();
    }
  });
});

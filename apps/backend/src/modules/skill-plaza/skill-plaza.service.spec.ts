import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { composePlazaSkillStageInstructions, createSkillPlazaService, resolvePlazaSkillWorkflowStages, SkillPlazaError } from "./skill-plaza.service.ts";

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
      assert.equal("files" in (mine.items[0]?.detail ?? {}), false);
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

  it("lets the owner hard-delete their own skill and rejects other users", async () => {
    const db = await createMigratedTestDb();
    try {
      const ownerId = "91000000-0000-4000-8000-000000000011";
      const otherId = "91000000-0000-4000-8000-000000000012";
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800139011', 'Skill 作者', 'plain:test-password', 'active'),
                ($2, '13800139012', '其他用户', 'plain:test-password', 'active')`,
        [ownerId, otherId],
      );
      const service = createSkillPlazaService({ db });
      const created = await service.create({
        userId: ownerId,
        name: "通用小说转剧本",
        summary: "待审核草稿",
        category: "general",
        detail: {
          introduction: "# SKILL.md\n\n把小说转成剧本。",
          usageScene: "小说转剧本",
          howToUse: "输入小说正文",
          outputContent: "剧本",
        },
      });
      const official = await service.createOfficial({
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

      await assert.rejects(
        () => service.deleteMine({ userId: otherId, skillId: String(created.id) }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_not_found",
      );
      await assert.rejects(
        () => service.deleteMine({ userId: ownerId, skillId: String(official.id) }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_not_found",
      );

      const deleted = await service.deleteMine({ userId: ownerId, skillId: String(created.id) });
      assert.deepEqual(deleted, { deleted: true, skillId: String(created.id) });

      const mine = await service.listMine(ownerId);
      assert.equal(mine.items.some((item) => String(item.id) === String(created.id)), false);
      await assert.rejects(
        () => service.getDetail({ skillId: String(created.id), userId: ownerId }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_not_found",
      );
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
      assert.equal(created.detail.fileListPublic, true);
      const hidden = await service.createOfficial({
        name: "官方隐藏文件清单",
        summary: "不公开文件",
        category: "short-drama",
        status: "published",
        files: [{ name: "SKILL.md", kind: "instruction", content: "## 做什么\n隐藏文件" }],
        detail: {
          introduction: "## 做什么\n隐藏文件",
          usageScene: "内部流程",
          howToUse: "输入剧本",
          outputContent: "镜头表",
          fileListPublic: false,
        },
      });
      assert.equal(hidden.detail.fileListPublic, false);
      const updated = await service.updateOfficial({
        skillId: String(hidden.id),
        name: "官方隐藏文件清单",
        summary: "不公开文件",
        category: "short-drama",
        status: "published",
        files: [{ name: "SKILL.md", kind: "instruction", content: "## 做什么\n隐藏文件" }],
        detail: {
          introduction: "## 做什么\n隐藏文件",
          usageScene: "内部流程",
          howToUse: "输入剧本",
          outputContent: "镜头表",
          fileListPublic: false,
        },
      });
      assert.equal(updated.detail.fileListPublic, false);
      const admin = await service.listAdmin({ status: "published", query: "官方短剧" });
      assert.equal(admin.items[0]?.fileCount, 1);
      const detail = await service.getAdminDetail(String(created.id));
      assert.equal(detail.files[0]?.name, "SKILL.md");
      assert.equal(detail.files[0]?.content, "## 做什么\n拆分镜头");
      const viewerId = "91000000-0000-4000-8000-000000000099";
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800139099', 'Skill 读者', 'plain:test-password', 'active')`,
        [viewerId],
      );
      const publicDetail = await service.getDetail({ skillId: String(created.id), userId: viewerId });
      assert.equal(publicDetail.files[0]?.name, "SKILL.md");
      assert.equal(publicDetail.files[0]?.content, "## 做什么\n拆分镜头");
      const hiddenDetail = await service.getDetail({ skillId: String(hidden.id), userId: viewerId });
      assert.equal(hiddenDetail.files[0]?.name, "SKILL.md");
      assert.equal(hiddenDetail.files[0]?.content, "## 做什么\n隐藏文件");
    } finally {
      await db.close();
    }
  });

  it("rejects official and user skills that exceed 50 files", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "91000000-0000-4000-8000-000000000005";
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800139005', 'Skill 作者', 'plain:test-password', 'active')`,
        [userId],
      );
      const service = createSkillPlazaService({ db });
      const tooMany = Array.from({ length: 51 }, (_, index) => ({
        name: index === 0 ? "SKILL.md" : `references/file-${index}.md`,
        kind: "instruction",
        content: `# file ${index}`,
      }));
      const allowed = tooMany.slice(0, 50);

      const official = await service.createOfficial({
        name: "官方 50 文件上限",
        summary: "允许 50 个文件",
        category: "general",
        status: "draft",
        files: allowed,
        detail: { introduction: "# SKILL.md" },
      });
      assert.equal((await service.getAdminDetail(String(official.id))).files.length, 50);
      await assert.rejects(
        () => service.createOfficial({
          name: "官方超限",
          summary: "超过 50 个文件",
          category: "general",
          files: tooMany,
          detail: { introduction: "# SKILL.md" },
        }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_files_too_many" && error.message === "Skill 文件最多上传 50 个",
      );

      const created = await service.create({
        userId,
        name: "用户 50 文件上限",
        summary: "允许 50 个文件",
        category: "general",
        detail: { introduction: "# SKILL.md", files: allowed },
      });
      assert.equal((await service.getAdminDetail(String(created.id))).files.length, 50);
      await assert.rejects(
        () => service.create({
          userId,
          name: "用户超限",
          summary: "超过 50 个文件",
          category: "general",
          detail: { introduction: "# SKILL.md", files: tooMany },
        }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_files_too_many" && error.message === "Skill 文件最多上传 50 个",
      );
    } finally {
      await db.close();
    }
  });

  it("treats recommendation as an admin flag instead of a category", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "91000000-0000-4000-8000-000000000004";
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800139004', 'Skill 作者', 'plain:test-password', 'active')`,
        [userId],
      );
      const service = createSkillPlazaService({ db });
      const created = await service.create({
        userId,
        name: "短剧推荐候选",
        summary: "把小说转成分镜",
        category: "recommended",
        detail: {
          introduction: "# SKILL.md",
          usageScene: "小说转分镜",
          howToUse: "输入小说正文",
          outputContent: "分镜表",
        },
      });
      assert.equal(created.category, "general");
      assert.equal(created.isRecommended, false);

      const published = await service.updateStatus({
        skillId: String(created.id),
        status: "published",
        reviewComment: "允许上架",
      });
      assert.equal(published.category, "general");

      const recommended = await service.updateRecommendation({
        skillId: String(created.id),
        isRecommended: true,
      });
      assert.equal(recommended.isRecommended, true);
      assert.equal(recommended.category, "general");

      const recommendedCatalog = await service.listCatalog({ category: "recommended" });
      assert.equal(recommendedCatalog.items[0]?.id, created.id);
      assert.equal("files" in (recommendedCatalog.items[0]?.detail ?? {}), false);
      const originalCategory = await service.listCatalog({ category: "general" });
      assert.equal(originalCategory.items[0]?.id, created.id);
      const filmCategory = await service.listCatalog({ category: "professional-film" });
      assert.equal(filmCategory.items.length, 0);
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

  it("resolves published plaza skills for episode workflow generation", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "91000000-0000-4000-8000-000000000003";
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800139003', 'Skill 作者', 'plain:test-password', 'active')`,
        [userId],
      );
      const service = createSkillPlazaService({ db });
      const created = await service.create({
        userId,
        name: "短剧一键转分镜",
        summary: "把小说转成分镜",
        category: "short-drama",
        detail: {
          introduction: "# SKILL.md\n按短剧节奏拆镜。",
          usageScene: "小说转分镜",
          howToUse: "输入小说正文",
          outputContent: "分镜表",
          files: [{ name: "SKILL.md", kind: "instruction", content: "# SKILL.md\n按短剧节奏拆镜。" }],
        },
      });
      await service.updateStatus({
        skillId: String(created.id),
        status: "published",
        reviewComment: "允许用于章节创作",
      });
      const catalog = await service.listCatalog({ userId, category: "short-drama" });
      assert.equal(catalog.items[0]?.id, String(created.id));
      assert.equal(catalog.items[0]?.detail?.outputContent, "分镜表");
      assert.equal("files" in (catalog.items[0]?.detail ?? {}), false);
      const resolved = await service.resolveWorkflowSkill({ userId, skillId: String(created.id) });
      assert.equal(resolved.id, String(created.id));
      assert.equal(resolved.title, "短剧一键转分镜");
      assert.match(resolved.content, /按短剧节奏拆镜/);
      assert.equal(resolved.files[0]?.name, "SKILL.md");
      assert.match(resolved.files[0]?.content ?? "", /按短剧节奏拆镜/);
      assert.deepEqual(resolvePlazaSkillWorkflowStages([resolved], { skipScriptStage: true }), ["shot"]);
      const usage = await db.query<{ usage_count: number }>("SELECT usage_count FROM skills WHERE id = $1", [created.id]);
      assert.equal(Number(usage.rows[0]?.usage_count ?? 0), 1);
      assert.equal(await service.findAccessibleSkillIdByName({ userId, name: "短剧一键转分镜" }), String(created.id));
      assert.equal(await service.findAccessibleSkillIdByName({ userId, name: "不存在的技能" }), null);
    } finally {
      await db.close();
    }
  });

  it("manages skill categories with fallback-safe listing and in-use delete protection", async () => {
    const db = await createMigratedTestDb();
    try {
      const userId = "91000000-0000-4000-8000-000000000011";
      await db.query(
        `INSERT INTO users (id, phone_e164, display_name, password_hash, status)
         VALUES ($1, '13800139011', 'Skill 分类作者', 'plain:test-password', 'active')`,
        [userId],
      );
      const service = createSkillPlazaService({ db });
      const listed = await service.listCategories();
      assert.equal(listed.items.some((item) => item.code === "recommended" && item.isSkillCategory === false && item.isSystem === true), true);
      assert.equal(listed.items.some((item) => item.code === "project-workflow" && item.allowUserCreate === false), true);

      const created = await service.createCategory({
        code: "custom-story",
        name: "自定义故事",
        shortName: "故事",
        sortOrder: 120,
        isVisible: true,
        allowUserCreate: true,
      });
      assert.equal(created.code, "custom-story");
      assert.equal(created.allowUserCreate, true);
      await assert.rejects(
        () => service.create({
          userId,
          name: "工作流用户技能",
          summary: "不应创建",
          category: "project-workflow",
          detail: { introduction: "# SKILL.md\n不可创建" },
        }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_category_not_user_creatable",
      );
      const blocked = await service.updateCategory({ categoryId: created.code, allowUserCreate: false, name: "自定义故事" });
      assert.equal(blocked.allowUserCreate, false);
      await assert.rejects(
        () => service.create({
          userId,
          name: "被禁分类技能",
          summary: "不应创建",
          category: "custom-story",
          detail: { introduction: "# SKILL.md\n不可创建" },
        }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_category_not_user_creatable",
      );
      const reopened = await service.updateCategory({ categoryId: created.code, allowUserCreate: true, name: "自定义故事" });
      assert.equal(reopened.allowUserCreate, true);
      await assert.rejects(
        () => service.createCategory({ code: "custom-story", name: "重复编码" }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_category_code_conflict",
      );
      await assert.rejects(
        () => service.createCategory({ code: "recommended", name: "推荐" }),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_category_not_assignable",
      );

      const skill = await service.create({
        userId,
        name: "自定义故事技能",
        summary: "分类占用",
        category: "custom-story",
        detail: { introduction: "# SKILL.md\n分类占用" },
      });
      assert.equal(skill.category, "custom-story");
      await assert.rejects(
        () => service.deleteCategory(created.code),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_category_in_use",
      );

      const hidden = await service.updateCategory({ categoryId: created.code, isVisible: false, name: "自定义故事" });
      assert.equal(hidden.isVisible, false);
      const visibleOnly = await service.listCategories();
      assert.equal(visibleOnly.items.some((item) => item.code === "custom-story"), false);
      const withHidden = await service.listCategories({ includeHidden: true });
      assert.equal(withHidden.items.some((item) => item.code === "custom-story" && item.isVisible === false), true);

      const recommended = listed.items.find((item) => item.code === "recommended");
      assert.ok(recommended);
      await assert.rejects(
        () => service.deleteCategory(recommended.code),
        (error: unknown) => error instanceof SkillPlazaError && error.code === "skill_category_system",
      );

      await db.query("UPDATE skills SET category = 'general' WHERE id = $1", [skill.id]);
      const deleted = await service.deleteCategory(created.code);
      assert.equal(deleted.code, "custom-story");
    } finally {
      await db.close();
    }
  });

  it("resolves plaza skill workflow stages from declared workflow instead of the comic pipeline", () => {
    assert.deepEqual(resolvePlazaSkillWorkflowStages([{
      title: "漫画角色一致性",
      summary: "保持角色三视图一致",
      outputContent: "角色提示词",
      workflow: [{ stage: "character" }],
      content: "角色一致性手册",
    }], { skipScriptStage: true }), ["character"]);
    assert.deepEqual(resolvePlazaSkillWorkflowStages([{
      title: "漫画角色一致性",
      summary: "保持角色三视图一致",
      files: [{ name: "references/character-extract.md" }],
    }], { skipScriptStage: true }), ["character"]);
    assert.deepEqual(resolvePlazaSkillWorkflowStages([{
      title: "通用小说一键转分镜提取",
      summary: "一键生成工作流",
      outputContent: "场景、角色、道具和分镜表",
    }], { skipScriptStage: true }), ["scene", "character", "prop", "shot"]);
    assert.deepEqual(resolvePlazaSkillWorkflowStages([{
      title: "通用小说转剧本",
      summary: "把小说转成剧本",
      outputContent: "剧本文本",
    }]), ["script"]);
  });

  it("filters only stage-named files and keeps unnamed user skill files on every stage", () => {
    const files = [
      { name: "SKILL.md", kind: "instruction", content: "# 小说转剧本流水线" },
      { name: "references/script.md", kind: "instruction", content: "剧本改编规范" },
      { name: "references/format-spec.md", kind: "instruction", content: "剧本格式规范" },
      { name: "references/example.md", kind: "instruction", content: "剧本示例" },
      { name: "references/qa-checklist.md", kind: "instruction", content: "剧本 QA" },
      { name: "references/shot.md", kind: "instruction", content: "分镜手册 15秒 转场" },
      { name: "references/character_extract.md", kind: "instruction", content: "角色三视图" },
      { name: "scripts/validate_screenplay.md", kind: "instruction", content: "校验器正则 退出码" },
      { name: "references/adaptation-workflow.md", kind: "instruction", content: "长篇改编工作流" },
    ];
    const script = composePlazaSkillStageInstructions({ files, stage: "script" });
    assert.match(script, /小说转剧本流水线/);
    assert.match(script, /剧本改编规范/);
    assert.match(script, /剧本格式规范/);
    assert.match(script, /长篇改编工作流/);
    assert.doesNotMatch(script, /分镜手册 15秒 转场/);
    assert.doesNotMatch(script, /角色三视图/);
    assert.doesNotMatch(script, /校验器正则 退出码/);
    const shot = composePlazaSkillStageInstructions({ files, stage: "shot" });
    assert.match(shot, /小说转剧本流水线/);
    assert.match(shot, /分镜手册 15秒 转场/);
    assert.match(shot, /剧本格式规范/);
    assert.match(shot, /长篇改编工作流/);
    assert.doesNotMatch(shot, /剧本改编规范/);
    assert.doesNotMatch(shot, /校验器正则 退出码/);
    const unstaged = composePlazaSkillStageInstructions({ files });
    assert.match(unstaged, /分镜手册 15秒 转场/);
    assert.match(unstaged, /校验器正则 退出码/);
    const userSkill = composePlazaSkillStageInstructions({
      files: [
        { name: "SKILL.md", kind: "instruction", content: "# 我的风格手册" },
        { name: "语气要求.md", kind: "instruction", content: "对白要短" },
        { name: "examples/demo.md", kind: "instruction", content: "示例段落" },
      ],
      stage: "script",
    });
    assert.match(userSkill, /我的风格手册/);
    assert.match(userSkill, /对白要短/);
    assert.match(userSkill, /示例段落/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { p0Capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import { createSkillPlazaService } from "../skill-plaza/skill-plaza.service.ts";
import { applySqlMigration } from "../shared/db/migrations.ts";
import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { claimProductionAgentTask } from "./production-agent.adapter.ts";
import {
  createProductionAgentConversation,
  createProductionAgentSessionTask,
  getProductionAgentConversation,
  listProductionAgentMessages,
} from "./production-agent-session.service.ts";
import { buildProductionAgentModelMessages, extractVisibleStreamText, parseProductionAgentTurn, ProductionAgentSessionExecutor } from "./production-agent-session.executor.ts";
import { artifactCoverage, createProductionAgentToolRegistry, formatProjectJson, storyboardCoverage } from "./production-agent-tools.ts";
import type { ProductionAgentSessionActor } from "./production-agent-session.types.ts";

describe("production agent session", { concurrency: false }, () => {
  it("parses production agent turns from JSON", () => {
    assert.deepEqual(parseProductionAgentTurn('{"kind":"final","message":"ok"}'), {
      kind: "final",
      message: "ok",
    });
    const turn = parseProductionAgentTurn('{"kind":"tool_call","toolId":"load_skill","callId":"c1","input":{"skillId":"s1"}}');
    assert.equal(turn.kind, "tool_call");
    if (turn.kind === "tool_call") {
      assert.equal(turn.toolId, "load_skill");
      assert.equal(turn.callId, "c1");
      assert.deepEqual(turn.input, { skillId: "s1" });
    }
    assert.throws(() => parseProductionAgentTurn("not-json"), /production_agent_model_response_invalid/);
    assert.equal(extractVisibleStreamText('{"kind":"final","message":"正在读取剧本'), "正在读取剧本");
  });

  it("formats markdown tables without treating headers as entities", () => {
    const project = formatProjectJson({
      title: "斗破",
      sourceText: "任小野进入乌坦城。",
      artifacts: {
        "characters.md": [
          "| 角色名称 | 角色描述 |",
          "| --- | --- |",
          "| 任小野 | 十七岁少年，身形偏瘦却结实 |",
          "| 闻婶 | 四十多岁妇人，面容清瘦 |",
        ].join("\n"),
        "scenes.md": [
          "【空间氛围】：温暖、烟火气、温情",
          "角色名称：不应成为场景",
          "场景名称：闻婶家灶炉旁",
          "黄昏，城墙隔绝阳光。",
        ].join("\n"),
        "shots.md": [
          "| 分镜剧情 | 对话/旁白 | 静态图片提示词 | 动态视频提示词 |",
          "| --- | --- | --- | --- |",
          "| 黄昏红霞铺满天空，任小野与任小草站在城墙边。 | 无台词。 | 黄昏城墙边，少年少女剪影。 | 中景固定镜头。 |",
        ].join("\n"),
      },
    });
    assert.deepEqual((project.characters as Array<{ characterName: string }>).map((item) => item.characterName), ["任小野", "闻婶"]);
    assert.equal((project.characters as Array<{ characterDescription: string }>)[0]?.characterDescription, "十七岁少年，身形偏瘦却结实");
    assert.deepEqual((project.scenes as Array<{ sceneName: string }>).map((item) => item.sceneName), ["闻婶家灶炉旁"]);
    assert.equal((project.storyboards as Array<{ plot: string }>)[0]?.plot.includes("黄昏红霞铺满天空"), true);
    assert.equal((project.storyboards as Array<{ plot: string }>).some((item) => item.plot.includes("分镜剧情")), false);
    assert.deepEqual((project.storyboards as Array<{ characterNames?: string[] }>)[0]?.characterNames, ["任小野"]);
    assert.equal((project.storyboards as Array<{ sceneName?: string }>)[0]?.sceneName, "闻婶家灶炉旁");
  });

  it("treats partial storyboards as incomplete until every script beat is covered", () => {
    const script = [
      "### 1-1 黄昏 外 城门广场",
      "任小草拉衣袖指向天边。",
      "### 1-2 黄昏 外 老旧木屋巷道",
      "闻婶升起灶炉。",
      "### 1-3 黄昏 外 城门口",
      "叙言提议合作。",
      "### 1-4 黄昏 外 城墙外灰晶收割场",
      "任小野摸向阴影尸体。",
    ].join("\n");
    const partial = storyboardCoverage({
      "script.md": script,
      "storyboards.json": JSON.stringify([
        { shotNo: 1, plot: "城门广场，任小草指向天边。", dialogue: "", imagePrompt: "广场", videoPrompt: "15秒" },
        { shotNo: 2, plot: "木屋巷道，闻婶生火。", dialogue: "", imagePrompt: "木屋", videoPrompt: "15秒" },
      ]),
    });
    const complete = storyboardCoverage({
      "script.md": script,
      "storyboards.json": JSON.stringify([
        { shotNo: 1, plot: "城门广场，任小草指向天边。", dialogue: "", imagePrompt: "广场", videoPrompt: "15秒" },
        { shotNo: 2, plot: "木屋巷道，闻婶生火。", dialogue: "", imagePrompt: "木屋", videoPrompt: "15秒" },
        { shotNo: 3, plot: "城门口，叙言提议合作。", dialogue: "", imagePrompt: "城门", videoPrompt: "15秒" },
        { shotNo: 4, plot: "灰晶收割场，任小野摸向阴影尸体。", dialogue: "", imagePrompt: "战场", videoPrompt: "15秒" },
      ]),
    });
    assert.equal(partial.complete, false);
    assert.equal(partial.uncoveredBeats.some((beat) => beat.includes("1-3")), true);
    assert.equal(complete.complete, true);
    assert.equal(complete.shotCount, 4);
  });

  it("treats partial characters, scenes, and props as incomplete until the script is covered", () => {
    const script = [
      "### 1-1 黄昏 外 城门广场",
      "人物：任小野、任小草",
      "道具：切割刀",
      "任小草指向天边。",
      "### 1-2 黄昏 外 木屋巷道",
      "人物：闻婶",
      "闻婶升起灶炉。",
    ].join("\n");
    const partial = artifactCoverage({
      "script.md": script,
      "characters.json": JSON.stringify([{ characterName: "任小野", characterDescription: "少年", characterImagePrompt: "少年" }]),
      "scenes.json": JSON.stringify([{ sceneName: "城门广场", sceneDescription: "黄昏广场", sceneImagePrompt: "广场" }]),
      "props.json": JSON.stringify([]),
      "storyboards.json": JSON.stringify([
        { shotNo: 1, plot: "城门广场，任小草指向天边。", dialogue: "", imagePrompt: "广场", videoPrompt: "15秒" },
      ]),
    });
    const complete = artifactCoverage({
      "script.md": script,
      "characters.json": JSON.stringify([
        { characterName: "任小野", characterDescription: "少年", characterImagePrompt: "少年" },
        { characterName: "任小草", characterDescription: "女孩", characterImagePrompt: "女孩" },
        { characterName: "闻婶", characterDescription: "妇人", characterImagePrompt: "妇人" },
      ]),
      "scenes.json": JSON.stringify([
        { sceneName: "城门广场", sceneDescription: "黄昏广场", sceneImagePrompt: "广场" },
        { sceneName: "木屋巷道", sceneDescription: "阴凉巷道", sceneImagePrompt: "巷道" },
      ]),
      "props.json": JSON.stringify([{ propName: "切割刀", propDescription: "特制刀", propImagePrompt: "刀" }]),
      "storyboards.json": JSON.stringify([
        { shotNo: 1, plot: "城门广场，任小草指向天边。", dialogue: "", imagePrompt: "广场", videoPrompt: "15秒" },
        { shotNo: 2, plot: "木屋巷道，闻婶升起灶炉。", dialogue: "", imagePrompt: "巷道", videoPrompt: "15秒" },
      ]),
    });
    assert.equal(partial.complete, false);
    assert.equal(partial.uncovered.characters.includes("任小草"), true);
    assert.equal(partial.uncovered.scenes.some((scene) => scene.includes("木屋巷道")), true);
    assert.equal(partial.uncovered.props.includes("切割刀"), true);
    assert.equal(complete.complete, true);
  });

  it("bootstraps with source text and SKILL.md, then maps tool results as user JSON", async () => {
    const tools = { listForModel() { return [{ id: "read_skill_file" }]; } };
    const conversation = {
      ownerUserId: "00000000-0000-4000-8000-000000000201",
      mode: "auto",
      source: { scriptFileName: "斗破.txt", text: "第1章 迷雾", totalChars: 5 },
      skillCatalog: [{
        id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1",
        name: "通用小说转剧本",
        description: "把小说转成剧本",
        files: [{ path: "SKILL.md", kind: "instruction" }, { path: "references/script.md", kind: "instruction" }],
      }],
      workspace: { artifacts: { "剧本.md": "黄昏城墙边。" }, projectJson: null },
    };
    const history = [
      { role: "user", content: { text: "请根据所选 Skill 和源文本开始分析。" } },
      { role: "tool", content: { toolId: "read_skill_file", callId: "c1", output: { path: "references/script.md" } } },
    ];
    const messages = await buildProductionAgentModelMessages(conversation as never, history as never, tools as never, async () => ({
      id: "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1",
      name: "通用小说转剧本",
      description: "把小说转成剧本",
      files: [
        { path: "SKILL.md", kind: "instruction", content: "# SKILL.md\n先改编再抽取。" },
        { path: "references/script.md", kind: "instruction", content: "改编手册" },
      ],
    }));

    assert.equal(messages[0]?.role, "system");
    assert.match(String(messages[0]?.content ?? ""), /You are 灵曦AI/);
    assert.match(String(messages[0]?.content ?? ""), /Plaza skill 通用小说转剧本/);
    assert.match(String(messages[0]?.content ?? ""), /先改编再抽取/);
    assert.match(String(messages[0]?.content ?? ""), /SKILL.md is already in the system prompt/);
    assert.doesNotMatch(String(messages[0]?.content ?? ""), /改编手册/);
    assert.doesNotMatch(String(messages[0]?.content ?? ""), /Keep videoPrompt to a short 15s/);
    assert.equal(messages.length, 2);
    assert.equal(messages[1]?.role, "user");
    assert.match(String(messages[1]?.content ?? ""), /"fileName":"斗破.txt"/);
    assert.match(String(messages[1]?.content ?? ""), /第1章 迷雾/);
    assert.match(String(messages[1]?.content ?? ""), /"剧本.md":"黄昏城墙边。"/);
    assert.match(String(messages[0]?.content ?? ""), /do not call read_source or read_artifact/);
    assert.match(String(messages[1]?.content ?? ""), /"path":"references\/script.md"/);
    assert.match(String(messages[1]?.content ?? ""), /"toolId":"read_skill_file"/);
    assert.match(String(messages[1]?.content ?? ""), /"role":"user"/);
    assert.match(String(messages[1]?.content ?? ""), /"role":"tool"/);
    assert.doesNotMatch(String(messages[1]?.content ?? ""), /改编手册/);
  });

  it("reads multiple skill files in one tool call", async () => {
    const skillId = "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2";
    const registry = createProductionAgentToolRegistry({
      db: {} as never,
      resolveSkillCatalog: async () => ({
        id: skillId,
        name: "通用小说转剧本",
        description: "把小说转成剧本",
        files: [
          { path: "SKILL.md", kind: "instruction", content: "skill body" },
          { path: "references/script.md", kind: "instruction", content: "script body" },
          { path: "references/shot.md", kind: "instruction", content: "shot body" },
        ],
      }),
      commitProject: async () => {
        throw new Error("create_project_should_not_run");
      },
    });
    const result = await registry.execute("read_skill_file", {
      skillId,
      paths: ["references/script.md", "references/shot.md"],
    }, toolContext("00000000-0000-4000-8000-000000000203", "conv", "task"));

    assert.equal(result.status, "succeeded");
    assert.equal(result.output.path, "references/script.md");
    assert.deepEqual(result.output.files, [
      { path: "references/script.md", content: "script body" },
      { path: "references/shot.md", content: "shot body" },
    ]);
  });

  it("creates a session conversation and task with production agentType and null canvas_project_id", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000201";
    const skillId = "a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1";
    try {
      await seedUser(db, userId, "13800138201");
      await seedPlazaSkill(db, skillId);
      const actor = sessionActor(userId);
      const now = new Date("2026-09-16T08:00:00.000Z");
      const conversation = await createProductionAgentConversation(db, {
        actor,
        title: "制作会话",
        mode: "ask",
        modelCode: "preview-script-model",
        source: { text: "任小野进入乌坦城。" },
        skillCatalog: [{
          id: skillId,
          name: "漫画角色一致性",
          description: "保持角色三视图一致",
          files: [{ path: "SKILL.md", kind: "instruction" }],
        }],
        now,
      });
      const task = await createProductionAgentSessionTask(db, {
        conversationId: conversation.id,
        actor,
        modelCode: "preview-script-model",
        modelConfigSnapshot: { modelCode: "preview-script-model" },
        userMessage: { text: "请根据所选 Skill 和源文本开始分析。", plazaSkillIds: [skillId] },
        now,
      });
      const workflow = await db.query<{
        workflow_type: string;
        canvas_project_id: string | null;
        agent_type: string;
      }>(
        `
          SELECT workflow.workflow_type, workflow.canvas_project_id,
                 workflow.input_snapshot_json->>'agentType' AS agent_type
          FROM workflows workflow
          WHERE workflow.id = $1
        `,
        [task.workflowId],
      );
      const workflowTask = await db.query<{
        canvas_project_id: string | null;
        agent_type: string;
      }>(
        `
          SELECT canvas_project_id, queue_name, target_entity_type, input_snapshot_json->>'agentType' AS agent_type
          FROM tasks
          WHERE id = $1
        `,
        [task.workflowTaskId],
      );

      assert.equal(conversation.createdProjectId, null);
      assert.equal(task.status, "queued");
      assert.deepEqual(workflow.rows[0], {
        workflow_type: "production_agent",
        canvas_project_id: null,
        agent_type: "production",
      });
      assert.deepEqual(workflowTask.rows[0], {
        canvas_project_id: null,
        queue_name: "production-agent-session",
        target_entity_type: "production_agent_session",
        agent_type: "production",
      });
    } finally {
      await db.close();
    }
  });

  it("repairs drifted session_json into workspace_json before creating a conversation", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000211";
    try {
      await seedUser(db, userId, "13800138211");
      await db.query(`
        ALTER TABLE production_agent_conversations
          RENAME COLUMN workspace_json TO session_json
      `);
      await db.query(`
        DO $$
        BEGIN
          IF EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conrelid = to_regclass(current_schema() || '.production_agent_conversations')
              AND conname = 'production_agent_conversations_workspace_json_not_null'
          ) THEN
            ALTER TABLE production_agent_conversations
              RENAME CONSTRAINT production_agent_conversations_workspace_json_not_null
              TO production_agent_conversations_session_json_not_null;
          END IF;
        END
        $$;
      `);
      await assert.rejects(
        createProductionAgentConversation(db, {
          actor: sessionActor(userId),
          title: "漂移会话",
          mode: "auto",
          modelCode: "preview-script-model",
          source: { text: "任小野进入乌坦城。" },
          skillCatalog: [],
          now: new Date("2026-09-16T08:00:00.000Z"),
        }),
        /workspace_json/,
      );
      await applySqlMigration(db, process.cwd(), "20261109-rename-production-agent-session-json.sql");
      await applySqlMigration(db, process.cwd(), "20261110-rename-production-agent-session-json-constraint.sql");
      const conversation = await createProductionAgentConversation(db, {
        actor: sessionActor(userId),
        title: "漂移会话",
        mode: "auto",
        modelCode: "preview-script-model",
        source: { text: "任小野进入乌坦城。" },
        skillCatalog: [],
        now: new Date("2026-09-16T08:00:00.000Z"),
      });
      assert.equal(conversation.title, "漂移会话");
      const columns = await db.query<{ column_name: string }>(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'production_agent_conversations'
            AND column_name IN ('session_json', 'workspace_json')
          ORDER BY column_name
        `,
      );
      assert.deepEqual(columns.rows.map((row) => row.column_name), ["workspace_json"]);
      const constraints = await db.query<{ conname: string }>(
        `
          SELECT conname
          FROM pg_constraint
          WHERE conrelid = to_regclass(current_schema() || '.production_agent_conversations')
            AND conname IN (
              'production_agent_conversations_session_json_not_null',
              'production_agent_conversations_workspace_json_not_null'
            )
          ORDER BY conname
        `,
      );
      assert.deepEqual(
        constraints.rows.map((row) => row.conname),
        ["production_agent_conversations_workspace_json_not_null"],
      );
    } finally {
      await db.close();
    }
  });

  it("refuses canvas.patch through the production agent tool registry", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000202";
    try {
      await seedUser(db, userId, "13800138202");
      const registry = createRegistry(db, userId);
      await assert.rejects(
        registry.execute("canvas.patch", { ops: [] }, toolContext(userId, "conv", "task")),
        (error: unknown) => error instanceof Error && (
          error.message === "production_agent_canvas_tool_forbidden"
          || error.message === "production_agent_tool_not_allowed"
        ),
      );
    } finally {
      await db.close();
    }
  });

  it("loads each skill SKILL.md before the first model turn", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000206";
    const skillId = "e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5";
    try {
      await seedUser(db, userId, "13800138206");
      await seedPlazaSkill(db, skillId);
      const actor = sessionActor(userId);
      const now = new Date("2026-09-16T08:30:00.000Z");
      const conversation = await createProductionAgentConversation(db, {
        actor,
        title: "加载主 Skill",
        mode: "ask",
        modelCode: "preview-script-model",
        source: { text: "任小野进入乌坦城。" },
        skillCatalog: [{
          id: skillId,
          name: "漫画角色一致性",
          description: "保持角色三视图一致",
          files: [{ path: "SKILL.md", kind: "instruction" }],
        }],
        now,
      });
      const task = await createProductionAgentSessionTask(db, {
        conversationId: conversation.id,
        actor,
        modelCode: "preview-script-model",
        modelConfigSnapshot: {},
        userMessage: { text: "请根据所选 Skill 和源文本开始分析。", plazaSkillIds: [skillId] },
        now,
      });
      const registry = createRegistry(db, userId);
      const executor = new ProductionAgentSessionExecutor({
        db,
        gateway: {
          async completeJson() {
            return JSON.stringify({ kind: "final", message: "已读取主 Skill" });
          },
        },
        tools: registry,
        resolveSkillCatalog: resolvePlazaSkillCatalog(db),
        now: () => now,
        maxRounds: 1,
      });
      await executor.execute(task.id);
      const messages = await listProductionAgentMessages(db, { conversationId: conversation.id, actor });
      const toolMessages = messages.filter((message) => message.role === "tool");
      const loadSkill = toolMessages[0];

      assert.equal(String(loadSkill?.content?.toolId ?? ""), "load_skill");
      assert.equal(String(loadSkill?.content?.output?.path ?? ""), "SKILL.md");
      assert.match(String(loadSkill?.content?.output?.content ?? ""), /只生成角色提示词/);
    } finally {
      await db.close();
    }
  });

  it("loads SKILL.md only and lists skill file paths without file content", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000203";
    const skillId = "b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2";
    try {
      await seedUser(db, userId, "13800138203");
      await seedPlazaSkill(db, skillId, {
        extraFiles: [{ name: "references/character.md", kind: "reference", content: "角色手册正文不应出现在清单里。" }],
      });
      const registry = createRegistry(db, userId);
      const context = toolContext(userId, "conv", "task");
      const loaded = await registry.execute("load_skill", { skillId }, context);
      const listed = await registry.execute("list_skill_files", { skillId }, context);

      assert.equal(loaded.status, "succeeded");
      assert.equal(loaded.output.path, "SKILL.md");
      assert.match(String(loaded.output.content ?? ""), /只生成角色提示词/);
      assert.doesNotMatch(String(loaded.output.content ?? ""), /角色手册正文/);
      assert.deepEqual(listed.output.files, [
        { path: "SKILL.md", kind: "instruction" },
        { path: "references/character.md", kind: "reference" },
      ]);
      assert.equal("content" in ((listed.output.files as Array<Record<string, unknown>>)[0] ?? {}), false);
    } finally {
      await db.close();
    }
  });

  it("writes artifacts then formats project.json without creating a project", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000204";
    const skillId = "c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3";
    try {
      await seedUser(db, userId, "13800138204");
      await seedPlazaSkill(db, skillId);
      const actor = sessionActor(userId);
      const now = new Date("2026-09-16T08:10:00.000Z");
      const conversation = await createProductionAgentConversation(db, {
        actor,
        title: "格式化会话",
        mode: "auto",
        modelCode: "preview-script-model",
        source: { text: "任小野进入乌坦城。" },
        skillCatalog: [{
          id: skillId,
          name: "漫画角色一致性",
          description: "保持角色三视图一致",
          files: [{ path: "SKILL.md", kind: "instruction" }],
        }],
        now,
      });
      let commitCalled = false;
      const registry = createProductionAgentToolRegistry({
        db,
        resolveSkillCatalog: resolvePlazaSkillCatalog(db),
        commitProject: async () => {
          commitCalled = true;
          throw new Error("create_project_should_not_run");
        },
        now: () => now,
      });
      const context = toolContext(userId, conversation.id, "task-format");
      await registry.execute("write_artifact", {
        path: "script.md",
        content: "### 1-1 黄昏 外 乌坦城\n任小野进入乌坦城。",
      }, context);
      await registry.execute("write_artifact", {
        path: "characters.json",
        content: JSON.stringify([{ characterName: "任小野", characterDescription: "黑发少年。", characterImagePrompt: "黑发少年。" }]),
      }, context);
      await registry.execute("write_artifact", {
        path: "scenes.json",
        content: JSON.stringify([{ sceneName: "乌坦城", sceneDescription: "黄昏城门", sceneImagePrompt: "城门" }]),
      }, context);
      await registry.execute("write_artifact", {
        path: "storyboards.json",
        content: JSON.stringify([{ shotNo: 1, plot: "任小野进入乌坦城。", dialogue: "", imagePrompt: "城门", videoPrompt: "15秒", sceneName: "乌坦城", characterNames: ["任小野"] }]),
      }, context);
      const formatted = await registry.execute("format_project", { title: "乌坦城" }, context);
      const loaded = await getProductionAgentConversation(db, { conversationId: conversation.id, actor });
      const projects = await db.query<{ count: number }>("SELECT count(*)::int AS count FROM projects");

      assert.equal(formatted.status, "succeeded");
      assert.equal(formatted.output.path, "project.json");
      assert.equal(loaded.createdProjectId, null);
      assert.equal(String(loaded.workspace.projectJson?.title ?? ""), "乌坦城");
      assert.equal(Array.isArray(loaded.workspace.projectJson?.characters), true);
      assert.equal((loaded.workspace.projectJson?.characters as Array<unknown>).length, 1);
      assert.match(loaded.workspace.artifacts["project.json"] ?? "", /"title": "乌坦城"/);
      assert.equal(commitCalled, false);
      assert.equal(projects.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("appends storyboard batches and refuses format_project until the script is covered", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000214";
    const skillId = "e5e5e5e5-e5e5-45e5-85e5-e5e5e5e5e5e5";
    try {
      await seedUser(db, userId, "13800138214");
      await seedPlazaSkill(db, skillId);
      const actor = sessionActor(userId);
      const now = new Date("2026-09-16T08:50:00.000Z");
      const conversation = await createProductionAgentConversation(db, {
        actor,
        title: "分镜覆盖",
        mode: "auto",
        modelCode: "preview-script-model",
        source: { text: "任小野进入乌坦城。" },
        skillCatalog: [{
          id: skillId,
          name: "漫画角色一致性",
          description: "保持角色三视图一致",
          files: [{ path: "SKILL.md", kind: "instruction" }],
        }],
        now,
      });
      const registry = createProductionAgentToolRegistry({
        db,
        resolveSkillCatalog: resolvePlazaSkillCatalog(db),
        commitProject: async () => {
          throw new Error("create_project_should_not_run");
        },
        now: () => now,
      });
      const context = toolContext(userId, conversation.id, "task-storyboard-coverage");
      await registry.execute("write_artifact", {
        path: "script.md",
        content: "### 1-1 黄昏 外 城门广场\n任小草指向天边。\n### 1-2 黄昏 外 木屋巷道\n闻婶生火。",
      }, context);
      await registry.execute("write_artifact", {
        path: "characters.json",
        content: JSON.stringify([
          { characterName: "任小草", characterDescription: "女孩", characterImagePrompt: "女孩" },
          { characterName: "闻婶", characterDescription: "妇人", characterImagePrompt: "妇人" },
        ]),
      }, context);
      await registry.execute("write_artifact", {
        path: "scenes.json",
        content: JSON.stringify([
          { sceneName: "城门广场", sceneDescription: "黄昏广场", sceneImagePrompt: "广场" },
          { sceneName: "木屋巷道", sceneDescription: "阴凉巷道", sceneImagePrompt: "巷道" },
        ]),
      }, context);
      await registry.execute("write_artifact", {
        path: "storyboards.json",
        content: JSON.stringify([{ shotNo: 1, plot: "城门广场，任小草指向天边。", dialogue: "", imagePrompt: "广场", videoPrompt: "15秒" }]),
      }, context);
      const blocked = await registry.execute("format_project", { title: "斗破" }, context);
      assert.equal(blocked.output.incomplete, true);
      assert.match(String(blocked.output.reason ?? ""), /production_agent_storyboards_incomplete/);
      await registry.execute("write_artifact", {
        path: "storyboards.json",
        content: JSON.stringify([{ shotNo: 2, plot: "木屋巷道，闻婶生火。", dialogue: "", imagePrompt: "木屋", videoPrompt: "15秒" }]),
      }, context);
      const formatted = await registry.execute("format_project", { title: "斗破" }, context);
      const loaded = await getProductionAgentConversation(db, { conversationId: conversation.id, actor });
      assert.equal(formatted.status, "succeeded");
      assert.equal((loaded.workspace.projectJson?.storyboards as Array<unknown>).length, 2);
    } finally {
      await db.close();
    }
  });

  it("refuses claiming a session workflow task through the old project adapter", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000205";
    const skillId = "d4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4";
    try {
      await seedUser(db, userId, "13800138205");
      await seedPlazaSkill(db, skillId);
      const actor = sessionActor(userId);
      const now = new Date("2026-09-16T08:20:00.000Z");
      const conversation = await createProductionAgentConversation(db, {
        actor,
        mode: "ask",
        modelCode: "preview-script-model",
        source: { text: "任小野进入乌坦城。" },
        skillCatalog: [{
          id: skillId,
          name: "漫画角色一致性",
          description: "保持角色三视图一致",
          files: [{ path: "SKILL.md", kind: "instruction" }],
        }],
        now,
      });
      const task = await createProductionAgentSessionTask(db, {
        conversationId: conversation.id,
        actor,
        modelCode: "preview-script-model",
        modelConfigSnapshot: {},
        userMessage: { text: "请根据所选 Skill 和源文本开始分析。", plazaSkillIds: [skillId] },
        now,
      });
      const routed = await db.query<{ canvas_project_id: string | null }>(
        "SELECT canvas_project_id FROM tasks WHERE id = $1",
        [task.workflowTaskId],
      );
      assert.equal(routed.rows[0]?.canvas_project_id, null);
      await assert.rejects(
        claimProductionAgentTask(db, {
          taskId: task.workflowTaskId,
          projectId: "00000000-0000-4000-8000-000000000299",
          workerId: "production-agent-session-isolation",
          now: new Date("2026-09-16T08:21:00.000Z"),
          leaseMs: 60_000,
        }),
        /production_agent_task_route_mismatch/,
      );
    } finally {
      await db.close();
    }
  });

  it("retries truncated model output instead of failing the task", async () => {
    const db = await createMigratedTestDb();
    const userId = "00000000-0000-4000-8000-000000000207";
    const skillId = "f6f6f6f6-f6f6-46f6-86f6-f6f6f6f6f6f6";
    try {
      await seedUser(db, userId, "13800138207");
      await seedPlazaSkill(db, skillId);
      const actor = sessionActor(userId);
      const now = new Date("2026-09-16T08:40:00.000Z");
      const conversation = await createProductionAgentConversation(db, {
        actor,
        title: "截断重试",
        mode: "ask",
        modelCode: "preview-script-model",
        source: { text: "任小野进入乌坦城。" },
        skillCatalog: [{
          id: skillId,
          name: "漫画角色一致性",
          description: "保持角色三视图一致",
          files: [{ path: "SKILL.md", kind: "instruction" }],
        }],
        now,
      });
      const task = await createProductionAgentSessionTask(db, {
        conversationId: conversation.id,
        actor,
        modelCode: "preview-script-model",
        modelConfigSnapshot: {},
        userMessage: { text: "请根据所选 Skill 和源文本开始分析。", plazaSkillIds: [skillId] },
        now,
      });
      let streamCalls = 0;
      const executor = new ProductionAgentSessionExecutor({
        db,
        gateway: {
          async completeJson() {
            throw new Error("completeJson should not be called");
          },
          async *streamJson() {
            streamCalls += 1;
            if (streamCalls === 1) {
              yield '{"kind":"tool_call","toolId":"write_artifact","callId":"c1","input":{"path":"shots.md","content":"| 分镜 |';
              throw Object.assign(new Error("provider_output_truncated"), { code: "provider_output_truncated" });
            }
            yield JSON.stringify({ kind: "final", message: "已继续" });
          },
        },
        tools: createRegistry(db, userId),
        resolveSkillCatalog: resolvePlazaSkillCatalog(db),
        now: () => now,
        maxRounds: 4,
      });
      const finished = await executor.execute(task.id);
      const messages = await listProductionAgentMessages(db, { conversationId: conversation.id, actor });
      const retry = messages.find((message) => message.role === "system" && message.content?.code === "production_agent_output_truncated_retry");

      assert.equal(finished.status, "succeeded");
      assert.equal(streamCalls, 2);
      assert.equal(Boolean(retry), true);
    } finally {
      await db.close();
    }
  });
});

function sessionActor(userId: string): ProductionAgentSessionActor {
  return {
    ownerUserId: userId,
    actorTeamMemberId: null,
    capabilities: new Set(p0Capabilities),
  };
}

function toolContext(userId: string, conversationId: string, agentTaskId: string) {
  return {
    conversationId,
    agentTaskId,
    agentStepId: "00000000-0000-4000-8000-000000000301",
    actor: sessionActor(userId),
    callId: "call-1",
  };
}

function createRegistry(db: Awaited<ReturnType<typeof createMigratedTestDb>>, userId: string) {
  return createProductionAgentToolRegistry({
    db,
    resolveSkillCatalog: resolvePlazaSkillCatalog(db),
    commitProject: async () => {
      throw new Error("create_project_should_not_run");
    },
  });
}

function resolvePlazaSkillCatalog(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const plaza = createSkillPlazaService({ db });
  return async (input: { userId: string; skillId: string }) => {
    const skill = await plaza.resolveWorkflowSkill(input);
    return {
      id: skill.id,
      name: skill.title,
      description: skill.summary,
      files: skill.files.map((file) => ({ path: file.name, kind: file.kind, content: file.content })),
    };
  };
}

async function seedUser(db: Awaited<ReturnType<typeof createMigratedTestDb>>, userId: string, phone: string) {
  await db.query(
    "INSERT INTO users (id, phone_e164, status) VALUES ($1, $2, 'active')",
    [userId, phone],
  );
}

async function seedPlazaSkill(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  skillId: string,
  options: { extraFiles?: Array<{ name: string; kind: string; content: string }> } = {},
) {
  const files = [
    { name: "SKILL.md", kind: "instruction", content: "# SKILL.md\n只生成角色提示词，保持角色一致性。" },
    ...(options.extraFiles ?? []),
  ];
  await db.query(
    `INSERT INTO skills (
       id, owner_user_id, name, summary, category, author_name, detail_json, status, visibility, is_recommended
     ) VALUES (
       $1, NULL, '漫画角色一致性', '保持角色三视图一致', 'animation-game', '官方',
       $2::jsonb, 'published', 'public', true
     )`,
    [skillId, JSON.stringify({
      introduction: "# SKILL.md\n只生成角色提示词，保持角色一致性。",
      usageScene: "漫画角色",
      howToUse: "上传剧本",
      outputContent: "角色提示词",
      workflow: [{ stage: "character" }],
      files,
    })],
  );
}

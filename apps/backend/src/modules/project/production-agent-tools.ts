import { capabilities } from "../../../../../packages/contracts/domain/capabilities.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { createProductionManifest } from "./production-agent.adapter.ts";
import type { ProductionManifest } from "./production-agent.types.ts";
import {
  getProductionAgentConversation,
  markProductionAgentProjectCreated,
  updateProductionAgentWorkspace,
} from "./production-agent-session.service.ts";
import { ProductionAgentToolRegistry } from "./production-agent-tool.registry.ts";
import type { ProductionAgentWorkspace } from "./production-agent-session.types.ts";

const WRITE_TOOLS = new Set(["write_artifact", "format_project", "create_project"]);

export function createProductionAgentToolRegistry(deps: {
  db: SqlDatabase;
  resolveSkillCatalog: (input: {
    userId: string;
    skillId: string;
  }) => Promise<{
    id: string;
    name: string;
    description: string;
    files: Array<{ path: string; kind: string; content: string }>;
  } | null>;
  commitProject: (input: {
    ownerUserId: string;
    conversationId: string;
    title: string;
    scriptText: string;
    manifest: ProductionManifest;
    now: Date;
  }) => Promise<{ projectId: string; episodeId: string | null }>;
  now?: () => Date;
}) {
  const registry = new ProductionAgentToolRegistry();
  const now = deps.now ?? (() => new Date());

  registry.register({
    id: "load_skill",
    description: "Load SKILL.md for one selected plaza skill. Do not load other files.",
    effect: "read",
    requiredCapability: capabilities.productionPlan,
    inputSchema: {
      type: "object",
      required: ["skillId"],
      additionalProperties: false,
      properties: { skillId: { type: "string", minLength: 1 } },
    },
    async execute(input, context) {
      const skill = await requireSkill(deps, context.actor.ownerUserId, String(input.skillId));
      const skillMd = skill.files.find((file) => file.path.split("/").pop()?.toLowerCase() === "skill.md");
      return {
        status: "succeeded",
        output: {
          skillId: skill.id,
          name: skill.name,
          path: skillMd?.path ?? "SKILL.md",
          content: skillMd?.content ?? skill.description,
        },
      };
    },
  });

  registry.register({
    id: "list_skill_files",
    description: "List file paths in a selected plaza skill. Returns names only.",
    effect: "read",
    requiredCapability: capabilities.productionPlan,
    inputSchema: {
      type: "object",
      required: ["skillId"],
      additionalProperties: false,
      properties: { skillId: { type: "string", minLength: 1 } },
    },
    async execute(input, context) {
      const skill = await requireSkill(deps, context.actor.ownerUserId, String(input.skillId));
      return {
        status: "succeeded",
        output: {
          skillId: skill.id,
          files: skill.files.map((file) => ({ path: file.path, kind: file.kind })),
        },
      };
    },
  });

  registry.register({
    id: "read_skill_file",
    description: "Read one or more files from a selected plaza skill package. Prefer paths:[...] to load several files in one call.",
    effect: "read",
    requiredCapability: capabilities.productionPlan,
    inputSchema: {
      type: "object",
      required: ["skillId"],
      additionalProperties: false,
      properties: {
        skillId: { type: "string", minLength: 1 },
        path: { type: "string", minLength: 1 },
        paths: { type: "array", items: { type: "string", minLength: 1 } },
      },
    },
    async execute(input, context) {
      const skill = await requireSkill(deps, context.actor.ownerUserId, String(input.skillId));
      const requested = collectSkillFilePaths(input);
      if (!requested.length) throw new Error("production_agent_skill_file_not_found");
      const files = requested.map((path) => {
        const file = skill.files.find((item) => normalizePath(item.path) === path);
        if (!file) throw new Error("production_agent_skill_file_not_found");
        return { path: file.path, content: file.content };
      });
      return {
        status: "succeeded",
        output: {
          skillId: skill.id,
          path: files[0]?.path,
          content: files[0]?.content,
          files,
        },
      };
    },
  });

  registry.register({
    id: "read_source",
    description: "Read remaining source text only when context.source.truncated is true. The latest source excerpt is already in context.",
    effect: "read",
    requiredCapability: capabilities.productionView,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        offset: { type: "integer", minimum: 0 },
        limit: { type: "integer", minimum: 1 },
      },
    },
    async execute(input, context) {
      const conversation = await getProductionAgentConversation(deps.db, {
        conversationId: context.conversationId,
        actor: context.actor,
      });
      const text = String(conversation.source.text ?? "");
      const offset = Number(input.offset ?? 0);
      const limit = Number(input.limit ?? text.length);
      return {
        status: "succeeded",
        output: {
          fileName: conversation.source.fileName ?? null,
          offset,
          text: text.slice(offset, offset + limit),
          totalChars: text.length,
        },
      };
    },
  });

  registry.register({
    id: "write_artifact",
    description: "Write one session artifact file. Follow the skill and the user's messages for content. Repeated writes to the same characters/scenes/props/storyboards file append.",
    effect: "write",
    requiredCapability: capabilities.productionAssetWrite,
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      additionalProperties: false,
      properties: {
        path: { type: "string", minLength: 1 },
        content: { type: "string", minLength: 1 },
      },
    },
    async execute(input, context) {
      const path = normalizePath(String(input.path));
      if (path === "project.json") throw new Error("production_agent_use_format_project");
      const workspace = await loadWorkspace(deps.db, context);
      const incoming = String(input.content);
      workspace.artifacts[path] = mergeArtifactContent(path, workspace.artifacts[path], incoming);
      await updateProductionAgentWorkspace(deps.db, {
        conversationId: context.conversationId,
        workspace,
        now: now(),
      });
      return { status: "succeeded", output: { path, bytes: String(workspace.artifacts[path]).length } };
    },
  });

  registry.register({
    id: "read_artifact",
    description: "Read one session artifact only if it is missing from context.workspace.artifacts. Do not reread a file already listed there.",
    effect: "read",
    requiredCapability: capabilities.productionView,
    inputSchema: {
      type: "object",
      required: ["path"],
      additionalProperties: false,
      properties: { path: { type: "string", minLength: 1 } },
    },
    async execute(input, context) {
      const path = normalizePath(String(input.path));
      const workspace = await loadWorkspace(deps.db, context);
      const content = workspace.artifacts[path];
      if (content == null) throw new Error("production_agent_artifact_not_found");
      return { status: "succeeded", output: { path, content } };
    },
  });

  registry.register({
    id: "ask_user",
    description: "Ask the user a question and wait before continuing.",
    effect: "ask",
    requiredCapability: capabilities.productionPlan,
    inputSchema: {
      type: "object",
      required: ["question"],
      additionalProperties: false,
      properties: {
        question: { type: "string", minLength: 1 },
        options: { type: "array", items: { type: "string" } },
      },
    },
    async execute(input) {
      return {
        status: "waiting_approval",
        output: {
          question: String(input.question),
          options: Array.isArray(input.options) ? input.options.map((item) => String(item)) : [],
        },
      };
    },
  });

  registry.register({
    id: "format_project",
    description: "Reshape completed skill artifacts into project.json from the current workspace. Do not pass the artifact bodies; the tool reads them itself.",
    effect: "write",
    requiredCapability: capabilities.productionPlan,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        title: { type: "string" },
      },
    },
    async execute(input, context) {
      const conversation = await getProductionAgentConversation(deps.db, {
        conversationId: context.conversationId,
        actor: context.actor,
      });
      const coverage = artifactCoverage(conversation.workspace.artifacts);
      if (!coverage.complete) {
        return {
          status: "succeeded",
          output: {
            incomplete: true,
            reason: coverage.reason,
            missing: coverage.missing,
            uncovered: coverage.uncovered,
            message: coverage.message,
          },
        };
      }
      const workspace = conversation.workspace;
      const projectJson = formatProjectJson({
        title: String(input.title ?? conversation.title ?? "未命名项目"),
        sourceText: String(conversation.source.text ?? ""),
        artifacts: workspace.artifacts,
      });
      workspace.projectJson = projectJson;
      workspace.reshapePending = false;
      workspace.artifacts["project.json"] = JSON.stringify(projectJson, null, 2);
      await updateProductionAgentWorkspace(deps.db, {
        conversationId: context.conversationId,
        workspace,
        now: now(),
      });
      return {
        status: "succeeded",
        output: {
          path: "project.json",
          summary: summarizeProjectJson(projectJson),
        },
      };
    },
  });

  registry.register({
    id: "create_project",
    description: "Create a project from the current project.json. Requires a formatted project.json.",
    effect: "commit",
    requiredCapability: capabilities.productionCommit,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async execute(_input, context) {
      const conversation = await getProductionAgentConversation(deps.db, {
        conversationId: context.conversationId,
        actor: context.actor,
      });
      if (conversation.createdProjectId) {
        return {
          status: "succeeded",
          output: { projectId: conversation.createdProjectId, replayed: true },
        };
      }
      const projectJson = conversation.workspace.projectJson;
      if (!projectJson) throw new Error("production_agent_project_json_required");
      const committed = await deps.commitProject({
        ownerUserId: context.actor.ownerUserId,
        conversationId: context.conversationId,
        title: String(projectJson.title ?? conversation.title ?? "未命名项目").slice(0, 60),
        scriptText: String(projectJson.scriptText ?? conversation.source.text ?? " "),
        manifest: createProductionManifest({ projectId: "00000000-0000-4000-8000-000000000000" }, {
          commitPayload: {
            scriptText: String(projectJson.scriptText ?? ""),
            scenes: Array.isArray(projectJson.scenes) ? projectJson.scenes : [],
            characters: Array.isArray(projectJson.characters) ? projectJson.characters : [],
            props: Array.isArray(projectJson.props) ? projectJson.props : [],
            storyboards: Array.isArray(projectJson.storyboards) ? projectJson.storyboards : [],
          },
        }),
        now: now(),
      });
      await markProductionAgentProjectCreated(deps.db, {
        conversationId: context.conversationId,
        projectId: committed.projectId,
        now: now(),
      });
      return {
        status: "succeeded",
        output: {
          projectId: committed.projectId,
          episodeId: committed.episodeId,
          summary: summarizeProjectJson(projectJson),
        },
      };
    },
  });

  return registry;
}

export function productionAgentToolRequiresApproval(mode: "ask" | "auto", toolId: string) {
  if (mode === "auto") return toolId === "ask_user";
  return WRITE_TOOLS.has(toolId) || toolId === "ask_user";
}

async function requireSkill(
  deps: {
    resolveSkillCatalog: (input: { userId: string; skillId: string }) => Promise<{
      id: string;
      name: string;
      description: string;
      files: Array<{ path: string; kind: string; content: string }>;
    } | null>;
  },
  userId: string,
  skillId: string,
) {
  const skill = await deps.resolveSkillCatalog({ userId, skillId });
  if (!skill) throw new Error("production_agent_skill_not_found");
  return skill;
}

async function loadWorkspace(
  db: SqlDatabase,
  context: { conversationId: string; actor: { ownerUserId: string; actorTeamMemberId?: string | null } },
): Promise<ProductionAgentWorkspace> {
  const conversation = await getProductionAgentConversation(db, context);
  return conversation.workspace;
}

function mappedProjectJson(input: Record<string, unknown>) {
  const characters = normalizeMappedRecords(input.characters, ["characterName", "characterDescription", "characterImagePrompt"]);
  const scenes = normalizeMappedRecords(input.scenes, ["sceneName", "sceneDescription", "sceneImagePrompt"]);
  const props = normalizeMappedRecords(input.props, ["propName", "propDescription", "propImagePrompt"]);
  const storyboards = normalizeMappedStoryboards(input.storyboards);
  if (!characters.length && !scenes.length && !props.length && !storyboards.length) return null;
  return {
    title: String(input.title ?? "").trim(),
    scriptText: String(input.scriptText ?? "").trim(),
    characters,
    scenes,
    props,
    storyboards,
  };
}

function normalizeMappedRecords(value: unknown, keys: [string, string, string]) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object").map((item) => {
    const record = item as Record<string, unknown>;
    return {
      [keys[0]]: String(record[keys[0]] ?? record.name ?? "").trim(),
      [keys[1]]: String(record[keys[1]] ?? record.description ?? "").trim(),
      [keys[2]]: String(record[keys[2]] ?? record.imagePrompt ?? record.prompt ?? "").trim(),
    };
  }).filter((item) => String(item[keys[0]]).trim());
}

function normalizeMappedStoryboards(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item && typeof item === "object").map((item, index) => {
    const record = item as Record<string, unknown>;
    return {
      shotNo: Number(record.shotNo ?? index + 1),
      plot: String(record.plot ?? record.description ?? "").trim(),
      dialogue: String(record.dialogue ?? "").trim(),
      imagePrompt: String(record.imagePrompt ?? "").trim(),
      videoPrompt: String(record.videoPrompt ?? "").trim(),
      sceneName: String(record.sceneName ?? record.scene ?? "").trim(),
      characterNames: stringList(record.characterNames ?? record.characters ?? record.characterName),
      propNames: stringList(record.propNames ?? record.props ?? record.propName),
    };
  }).filter((item) => item.plot);
}

export function formatProjectJson(input: {
  title: string;
  sourceText: string;
  artifacts: Record<string, string>;
}) {
  const scriptText = firstMatching(input.artifacts, [/script/i, /screenplay/i, /剧本/]) || input.sourceText;
  const scenes = parseNamedRecords(firstMatching(input.artifacts, [/scene/i, /场景/]), ["sceneName", "sceneDescription", "sceneImagePrompt"]);
  const characters = parseNamedRecords(firstMatching(input.artifacts, [/character/i, /角色/]), ["characterName", "characterDescription", "characterImagePrompt"]);
  const props = parseNamedRecords(firstMatching(input.artifacts, [/prop/i, /道具/]), ["propName", "propDescription", "propImagePrompt"]);
  return {
    title: input.title,
    scriptText,
    scenes,
    characters,
    props,
    storyboards: attachStoryboardAssetRefs(
      parseStoryboards(firstMatching(input.artifacts, [/shot/i, /storyboard/i, /分镜/])),
      { scenes, characters, props },
    ),
  };
}

export function storyboardCoverage(artifacts: Record<string, string> = {}) {
  return artifactCoverage(artifacts).storyboards;
}

export function artifactCoverage(artifacts: Record<string, string> = {}) {
  const scriptText = firstMatching(artifacts, [/script/i, /screenplay/i, /剧本/]);
  const mentioned = mentionedEntities(scriptText);
  const characters = parseNamedRecords(firstMatching(artifacts, [/character/i, /角色/]), ["characterName", "characterDescription", "characterImagePrompt"]);
  const scenes = parseNamedRecords(firstMatching(artifacts, [/scene/i, /场景/]), ["sceneName", "sceneDescription", "sceneImagePrompt"]);
  const props = parseNamedRecords(firstMatching(artifacts, [/prop/i, /道具/]), ["propName", "propDescription", "propImagePrompt"]);
  const storyboards = parseStoryboards(firstMatching(artifacts, [/shot/i, /storyboard/i, /分镜/]));
  const characterNames = namedValues(characters, "characterName");
  const sceneNames = namedValues(scenes, "sceneName");
  const propNames = namedValues(props, "propName");
  const shotHaystack = storyboards.map((item) => `${item.plot ?? ""} ${item.dialogue ?? ""} ${item.sceneName ?? ""}`).join("\n");
  const beats = scriptBeats(scriptText);
  const uncoveredBeats = beats.filter((beat) => !beatCovered(shotHaystack, beat));
  const uncoveredCharacters = mentioned.characters.filter((name) => !characterNames.includes(name));
  const uncoveredScenes = mentioned.scenes.filter((name) => !sceneNames.some((scene) => scene.includes(name) || name.includes(scene)));
  const uncoveredProps = mentioned.props.filter((name) => !propNames.includes(name));
  const requiredShotCount = Math.max(beats.length, 1);
  const storyboardComplete = storyboards.length > 0 && uncoveredBeats.length === 0 && storyboards.length >= requiredShotCount;
  const missing: string[] = [];
  if (!characters.length || uncoveredCharacters.length) missing.push("characters");
  if (!scenes.length || uncoveredScenes.length) missing.push("scenes");
  if (mentioned.props.length ? uncoveredProps.length > 0 : false) missing.push("props");
  if (!storyboardComplete) missing.push("storyboards");
  const uncovered = {
    characters: uncoveredCharacters,
    scenes: uncoveredScenes,
    props: uncoveredProps,
    storyboards: uncoveredBeats.map((beat) => beat.label),
  };
  const complete = missing.length === 0;
  const reason = complete
    ? ""
    : missing.includes("storyboards")
      ? (uncoveredBeats.length
        ? `production_agent_storyboards_incomplete:${uncoveredBeats.map((beat) => beat.label).join(",")}`
        : `production_agent_storyboards_incomplete:${storyboards.length}/${requiredShotCount}`)
      : missing.includes("characters")
        ? `production_agent_characters_incomplete:${uncoveredCharacters.join(",") || "none"}`
        : missing.includes("scenes")
          ? `production_agent_scenes_incomplete:${uncoveredScenes.join(",") || "none"}`
          : `production_agent_props_incomplete:${uncoveredProps.join(",") || "none"}`;
  const message = complete
    ? ""
    : `Artifacts incomplete. Missing ${missing.join(", ")}. Append remaining characters [${uncoveredCharacters.join("、") || "-"}], scenes [${uncoveredScenes.join("、") || "-"}], props [${uncoveredProps.join("、") || "-"}], storyboard beats [${uncovered.storyboards.join("、") || "-"}]. Do not create the project yet.`;
  return {
    complete,
    missing,
    uncovered,
    reason,
    message,
    storyboards: {
      complete: storyboardComplete,
      shotCount: storyboards.length,
      requiredShotCount,
      uncoveredBeats: uncovered.storyboards,
      reason: storyboardComplete ? "" : reason,
    },
  };
}

function mergeArtifactContent(path: string, existing: string | undefined, incoming: string) {
  if (/character|角色/i.test(path)) {
    return mergeNamedArtifact(existing, incoming, ["characterName", "characterDescription", "characterImagePrompt"]);
  }
  if (/scene|场景/i.test(path)) {
    return mergeNamedArtifact(existing, incoming, ["sceneName", "sceneDescription", "sceneImagePrompt"]);
  }
  if (/prop|道具/i.test(path)) {
    return mergeNamedArtifact(existing, incoming, ["propName", "propDescription", "propImagePrompt"]);
  }
  if (/shot|storyboard|分镜/i.test(path)) {
    return mergeStoryboardArtifact(existing, incoming);
  }
  return incoming;
}

function mergeNamedArtifact(existing: string | undefined, incoming: string, keys: [string, string, string]) {
  const merged = [
    ...parseNamedRecords(String(existing ?? ""), keys),
    ...parseNamedRecords(incoming, keys),
  ];
  const seen = new Set<string>();
  const records: Array<Record<string, unknown>> = [];
  for (const item of merged) {
    const name = String(item[keys[0]] ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    records.push(item);
  }
  return records.length ? JSON.stringify(records, null, 2) : incoming;
}

function mergeStoryboardArtifact(existing: string | undefined, incoming: string) {
  const merged = [
    ...parseStoryboards(String(existing ?? "")),
    ...parseStoryboards(incoming),
  ];
  const seen = new Set<string>();
  const records: Array<Record<string, unknown>> = [];
  for (const item of merged) {
    const key = `${item.shotNo}|${item.plot}`;
    if (!item.plot || seen.has(key)) continue;
    seen.add(key);
    records.push(item);
  }
  return records.length ? JSON.stringify(records, null, 2) : incoming;
}

function mentionedEntities(scriptText: string) {
  const text = String(scriptText ?? "");
  const headingScenes = [...text.matchAll(/^(?:#{1,6}\s+)?(?:\d+[-.]\d+|[一二三四五六七八九十]+[、.．]|第[一二三四五六七八九十\d]+场)\s*(.+)$/gm)]
    .flatMap((match) => sceneNameCandidates(match[1]));
  const labeledScenes = [...text.matchAll(/^(?:#{1,6}\s+)?(?:场景|内景|外景)[:：]?\s*(.+)$/gm)]
    .flatMap((match) => sceneNameCandidates(match[1]));
  const labeledCharacters = [...text.matchAll(/(?:^|\n)\s*(?:人物|角色)[:：]\s*(.+)$/gm)]
    .flatMap((match) => String(match[1] ?? "").split(/[，,、/|]/u).map((item) => item.trim()))
    .filter((name) => name.length >= 2);
  const labeledProps = [...text.matchAll(/(?:^|\n)\s*(?:道具|物品)[:：]\s*(.+)$/gm)]
    .flatMap((match) => String(match[1] ?? "").split(/[，,、/|]/u).map((item) => item.trim()))
    .filter((name) => name.length >= 2);
  return {
    characters: uniqueNames(labeledCharacters),
    scenes: uniqueNames([...headingScenes, ...labeledScenes]),
    props: uniqueNames(labeledProps),
  };
}

function sceneNameCandidates(value: unknown) {
  return String(value ?? "")
    .replace(/^(?:黄昏|清晨|正午|夜晚|日|夜|内|外)\s+/u, "")
    .split(/[，,、/|]/u)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !/^(?:人物|天气|黄昏|外|内|日|夜)$/u.test(item));
}

function scriptBeats(scriptText: string) {
  const headings = [...String(scriptText ?? "").matchAll(/^(?:#{1,6}\s+)?(\d+[-.]\d+|[一二三四五六七八九十]+[、.．]|第[一二三四五六七八九十\d]+场)\s*(.+)$/gm)]
    .map((match) => ({
      label: `${match[1]} ${String(match[2] ?? "").replace(/\s+/g, " ").trim()}`.trim(),
      tokens: beatTokens(`${match[1]} ${match[2]}`),
    }))
    .filter((beat) => beat.tokens.length);
  if (headings.length) return headings;
  const scenes = [...String(scriptText ?? "").matchAll(/^(?:#{1,6}\s+)?(?:场景|内景|外景)[:：]?\s*(.+)$/gm)]
    .map((match) => ({
      label: String(match[1] ?? "").trim(),
      tokens: beatTokens(match[1]),
    }))
    .filter((beat) => beat.tokens.length);
  return scenes;
}

function beatTokens(value: unknown) {
  return String(value ?? "")
    .replace(/[#*]/g, " ")
    .split(/[\s，,、:：\-_/|]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !/^(?:人物|天气|黄昏|外|内|日|夜)$/u.test(token));
}

function beatCovered(haystack: string, beat: { label: string; tokens: string[] }) {
  if (haystack.includes(beat.label)) return true;
  const hits = beat.tokens.filter((token) => haystack.includes(token)).length;
  return hits >= Math.min(2, beat.tokens.length);
}

function firstMatching(artifacts: Record<string, string>, patterns: RegExp[]) {
  for (const [path, content] of Object.entries(artifacts)) {
    if (path === "project.json") continue;
    if (patterns.some((pattern) => pattern.test(path))) return content;
  }
  return "";
}

function parseNamedRecords(text: string, keys: [string, string, string]) {
  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item && typeof item === "object").map((item) => ({
        [keys[0]]: String(item[keys[0]] ?? item.name ?? "").trim(),
        [keys[1]]: String(item[keys[1]] ?? item.description ?? "").trim(),
        [keys[2]]: String(item[keys[2]] ?? item.imagePrompt ?? "").trim(),
      })).filter((item) => String(item[keys[0]]).trim());
    }
  } catch {
    // fall through to markdown tables and labeled blocks
  }
  const tableRecords = parseMarkdownNamedRecords(text, keys);
  if (tableRecords.length) return tableRecords;
  const labeledRecords = parseLabeledNamedRecords(text, keys);
  if (labeledRecords.length) return labeledRecords;
  return [];
}

function parseStoryboards(text: string) {
  if (!text.trim()) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item && typeof item === "object").map((item, index) => ({
        shotNo: Number(item.shotNo ?? index + 1),
        plot: String(item.plot ?? item.description ?? "").trim(),
        dialogue: String(item.dialogue ?? "").trim(),
        imagePrompt: String(item.imagePrompt ?? "").trim(),
        videoPrompt: String(item.videoPrompt ?? "").trim(),
        sceneName: String(item.sceneName ?? item.scene ?? "").trim(),
        characterNames: stringList(item.characterNames ?? item.characters ?? item.characterName),
        propNames: stringList(item.propNames ?? item.props ?? item.propName),
      })).filter((item) => item.plot);
    }
  } catch {
    // fall through to markdown tables
  }
  const table = parseMarkdownTable(text);
  if (!table) return [];
  const header = table.header.map((cell) => cell.replace(/\s+/g, ""));
  const plotIndex = header.findIndex((cell) => /剧情|plot/i.test(cell));
  const dialogueIndex = header.findIndex((cell) => /对话|旁白|dialogue/i.test(cell));
  const imageIndex = header.findIndex((cell) => /静态|图片提示词|imagePrompt/i.test(cell));
  const videoIndex = header.findIndex((cell) => /动态|视频提示词|videoPrompt/i.test(cell));
  const sceneIndex = header.findIndex((cell) => /场景/u.test(cell) && !/描述|提示词/u.test(cell));
  const characterIndex = header.findIndex((cell) => /角色/u.test(cell) && !/描述|提示词/u.test(cell));
  const propIndex = header.findIndex((cell) => /道具/u.test(cell) && !/描述|提示词/u.test(cell));
  return table.rows
    .map((cells, index) => {
      const shotCells = cells.length >= 5 ? cells.slice(1) : cells;
      const plot = compactMarkdownCell(plotIndex >= 0 ? cells[plotIndex] : shotCells[0]);
      return {
        shotNo: Number(compactMarkdownCell(cells.length >= 5 ? cells[0] : String(index + 1)).replace(/[^\d]/g, "") || index + 1),
        plot,
        dialogue: compactMarkdownCell(dialogueIndex >= 0 ? cells[dialogueIndex] : shotCells[1]),
        imagePrompt: compactMarkdownCell(imageIndex >= 0 ? cells[imageIndex] : shotCells[2]),
        videoPrompt: compactMarkdownCell(videoIndex >= 0 ? cells[videoIndex] : shotCells[3]),
        sceneName: compactMarkdownCell(sceneIndex >= 0 ? cells[sceneIndex] : ""),
        characterNames: stringList(characterIndex >= 0 ? cells[characterIndex] : ""),
        propNames: stringList(propIndex >= 0 ? cells[propIndex] : ""),
      };
    })
    .filter((item) => item.plot && !isMarkdownHeaderCell(item.plot));
}

function attachStoryboardAssetRefs(
  storyboards: Array<Record<string, unknown>>,
  assets: {
    scenes: Array<Record<string, unknown>>;
    characters: Array<Record<string, unknown>>;
    props: Array<Record<string, unknown>>;
  },
) {
  const sceneNames = namedValues(assets.scenes, "sceneName");
  const characterNames = namedValues(assets.characters, "characterName");
  const propNames = namedValues(assets.props, "propName");
  return storyboards.map((storyboard) => {
    const haystack = [
      storyboard.plot,
      storyboard.dialogue,
      storyboard.imagePrompt,
      storyboard.videoPrompt,
      storyboard.sceneName,
      ...(Array.isArray(storyboard.characterNames) ? storyboard.characterNames : []),
      ...(Array.isArray(storyboard.propNames) ? storyboard.propNames : []),
    ].map((item) => String(item ?? "")).join("\n");
    const sceneName = String(storyboard.sceneName ?? "").trim() || matchFirstName(haystack, sceneNames);
    const matchedCharacters = uniqueNames([
      ...stringList(storyboard.characterNames),
      ...matchAllNames(haystack, characterNames),
    ]);
    const matchedProps = uniqueNames([
      ...stringList(storyboard.propNames),
      ...matchAllNames(haystack, propNames),
    ]);
    return {
      ...storyboard,
      sceneName,
      characterNames: matchedCharacters,
      propNames: matchedProps,
    };
  });
}

function namedValues(records: Array<Record<string, unknown>>, key: string) {
  return records.map((item) => String(item[key] ?? "").trim()).filter(Boolean);
}

function matchFirstName(text: string, names: string[]) {
  return matchAllNames(text, names)[0] ?? "";
}

function matchAllNames(text: string, names: string[]) {
  return names.filter((name) => name && text.includes(name));
}

function uniqueNames(values: string[]) {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const value of values) {
    const name = String(value ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueNames(value.map((item) => String(item ?? "")));
  return uniqueNames(String(value ?? "").split(/[，,、/|]/u));
}

function parseMarkdownNamedRecords(text: string, keys: [string, string, string]) {
  const table = parseMarkdownTable(text);
  if (!table) return [];
  const header = table.header.map((cell) => cell.replace(/\s+/g, ""));
  const nameIndex = Math.max(0, header.findIndex((cell) => /名称|name/i.test(cell)));
  const descriptionIndex = header.findIndex((cell) => /描述|description/i.test(cell));
  const promptIndex = header.findIndex((cell) => /提示词|prompt/i.test(cell));
  return table.rows
    .map((cells) => {
      const name = cleanRecordName(compactMarkdownCell(cells[nameIndex]), keys[0]);
      const description = compactMarkdownCell(descriptionIndex >= 0 ? cells[descriptionIndex] : cells[1]);
      const prompt = compactMarkdownCell(promptIndex >= 0 ? cells[promptIndex] : description);
      return {
        [keys[0]]: name,
        [keys[1]]: description,
        [keys[2]]: prompt || description,
      };
    })
    .filter((item) => String(item[keys[0]]).trim() && !isMarkdownHeaderCell(String(item[keys[0]])));
}

function parseLabeledNamedRecords(text: string, keys: [string, string, string]) {
  const labels = keys[0] === "characterName"
    ? ["角色名称", "角色名"]
    : keys[0] === "sceneName"
      ? ["场景名称", "场景名"]
      : ["道具名称", "道具名"];
  const records: Array<Record<string, string>> = [];
  let name = "";
  let block: string[] = [];
  const flush = () => {
    const content = block.map((line) => line.replace(/^[-*]\s*/, "").trim()).filter(Boolean).join("\n").trim();
    const cleaned = cleanRecordName(name, keys[0]);
    if (cleaned && !isReservedAssetLabel(cleaned)) {
      records.push({
        [keys[0]]: cleaned,
        [keys[1]]: content,
        [keys[2]]: content,
      });
    }
    name = "";
    block = [];
  };
  for (const rawLine of String(text ?? "").split("\n")) {
    const line = rawLine.trim().replace(/^#{1,6}\s*/, "").replace(/\*\*/g, "");
    const labeled = line.match(new RegExp(`^(?:${labels.join("|")})\\s*[:：]\\s*(.+)$`));
    const bracket = line.match(/^(?:【|\[)\s*([^】\]]+?)\s*(?:】|\])\s*[:：]?\s*(.*)$/);
    if (labeled) {
      flush();
      name = labeled[1] ?? "";
      continue;
    }
    if (bracket && !isReservedAssetLabel(String(bracket[1] ?? ""))) {
      flush();
      name = String(bracket[1] ?? "").trim();
      if (bracket[2]) block.push(String(bracket[2]));
      continue;
    }
    if (name) block.push(rawLine);
  }
  flush();
  return records;
}

function parseMarkdownTable(raw: string) {
  const lines = String(raw ?? "")
    .split("\n")
    .map((line) => String(line ?? "").trim())
    .filter((line) => line.includes("|"));
  if (lines.length < 2) return null;
  let header: string[] | null = null;
  const rows: string[][] = [];
  for (const line of lines) {
    const cells = line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => compactMarkdownCell(cell));
    if (cells.length < 2) continue;
    if (cells.every((cell) => !cell || /^:?-{3,}:?$/.test(cell))) continue;
    if (!header) {
      header = cells;
      continue;
    }
    if (cells.every((cell) => isMarkdownHeaderCell(cell))) continue;
    rows.push(cells);
  }
  return header && rows.length ? { header, rows } : null;
}

function compactMarkdownCell(value: unknown) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanRecordName(value: string, key: string) {
  const prefix = key === "characterName"
    ? /^(?:角色名称|角色名)\s*[:：]\s*/
    : key === "sceneName"
      ? /^(?:场景名称|场景名)\s*[:：]\s*/
      : /^(?:道具名称|道具名)\s*[:：]\s*/;
  return value.replace(prefix, "").replace(/[|]/g, " ").replace(/\s+/g, " ").trim();
}

function isMarkdownHeaderCell(value: string) {
  const normalized = value.replace(/\s+/g, "");
  return /^(?:角色名称|角色描述|角色提示词|场景名称|场景描述|场景提示词|道具名称|道具描述|道具提示词|分镜剧情|对话\/旁白|对话|旁白|静态图片提示词|动态视频提示词|图片提示词|视频提示词)$/u.test(normalized);
}

function isReservedAssetLabel(value: string) {
  return /^(?:角色名称|场景名称|道具名称|场景名|角色名|道具名|分镜|画幅构图|视觉风格|场景描述|环境类型|时间时刻|空间氛围|主要特征|正向提示词|负向提示词|画面构图|生图提示词|Prompt)$/iu.test(value.trim());
}

function summarizeProjectJson(projectJson: Record<string, unknown>) {
  return {
    title: String(projectJson.title ?? ""),
    scriptChars: String(projectJson.scriptText ?? "").length,
    sceneCount: Array.isArray(projectJson.scenes) ? projectJson.scenes.length : 0,
    characterCount: Array.isArray(projectJson.characters) ? projectJson.characters.length : 0,
    propCount: Array.isArray(projectJson.props) ? projectJson.props.length : 0,
    shotCount: Array.isArray(projectJson.storyboards) ? projectJson.storyboards.length : 0,
  };
}

function collectSkillFilePaths(input: Record<string, unknown>) {
  const values = [
    ...(Array.isArray(input.paths) ? input.paths : []),
    input.path,
  ];
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const value of values) {
    const path = normalizePath(String(value ?? ""));
    if (!path || seen.has(path)) continue;
    seen.add(path);
    paths.push(path);
    if (paths.length >= 8) break;
  }
  return paths;
}

function normalizePath(value: string) {
  return String(value ?? "").replaceAll("\\", "/").replace(/^\/+/, "").trim();
}

export type { ProductionManifest };

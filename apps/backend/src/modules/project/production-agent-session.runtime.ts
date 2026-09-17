import type { TextChatGatewayLike } from "../ai-storyboard/ai-storyboard-preview.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { createSkillPlazaService, SkillPlazaError } from "../skill-plaza/skill-plaza.service.ts";
import { ProductionAgentSessionExecutor } from "./production-agent-session.executor.ts";
import { listQueuedProductionAgentSessionTaskIds } from "./production-agent-session.service.ts";
import {
  createProductionAgentToolRegistry,
  type ProductionManifest,
} from "./production-agent-tools.ts";

export function createProductionAgentSkillCatalogResolver(db: SqlDatabase) {
  const plaza = createSkillPlazaService({ db });
  return async (input: { userId: string; skillId: string }) => {
    try {
      const skill = await plaza.resolveWorkflowSkill(input);
      return {
        id: skill.id,
        name: skill.title,
        description: skill.summary,
        files: (skill.files ?? []).map((file) => ({
          path: file.name,
          kind: file.kind,
          content: file.content,
        })),
      };
    } catch (error) {
      if (error instanceof SkillPlazaError) return null;
      throw error;
    }
  };
}

export function createProductionAgentSessionRuntime(input: {
  db: SqlDatabase;
  gateway: TextChatGatewayLike;
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
  const tools = createProductionAgentToolRegistry({
    db: input.db,
    resolveSkillCatalog: input.resolveSkillCatalog,
    commitProject: input.commitProject,
    now: input.now,
  });
  const executor = new ProductionAgentSessionExecutor({
    db: input.db,
    gateway: input.gateway,
    tools,
    resolveSkillCatalog: input.resolveSkillCatalog,
    now: input.now,
  });
  return {
    executor,
    tools,
    async processQueuedTasks(limit?: number) {
      const ids = await listQueuedProductionAgentSessionTaskIds(input.db, limit);
      const results = [];
      for (const id of ids) {
        results.push(await executor.execute(id));
      }
      return results;
    },
  };
}

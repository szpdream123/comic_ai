import type { SqlDatabase } from "../shared/db/sql.ts";
import {
  CanvasUserConfigError,
  archiveCanvasUserConfig,
  createCanvasUserConfig,
  createCanvasUserConfigVersion,
  listCanvasUserConfigs,
  listCanvasUserConfigVersions,
  resolveCanvasUserConfigSnapshot,
  type CanvasUserConfigType,
} from "./canvas-user-config.service.ts";

export type CanvasUserConfigRoute = {
  configId: string | null;
  versions: boolean;
};

export function matchCanvasUserConfigRoute(pathname: string): CanvasUserConfigRoute | null {
  if (pathname === "/api/canvas-library/configs") return { configId: null, versions: false };
  const match = pathname.match(/^\/api\/canvas-library\/configs\/([^/]+)(\/versions)?$/);
  if (!match) return null;
  return {
    configId: decodeURIComponent(match[1] ?? ""),
    versions: Boolean(match[2]),
  };
}

export function createCanvasUserConfigHttpService(db: SqlDatabase) {
  return {
    async handle(input: {
      method: string;
      route: CanvasUserConfigRoute;
      ownerUserId: string;
      actorUserId: string;
      canManage: boolean;
      query?: URLSearchParams;
      body?: Record<string, unknown>;
      now: Date;
    }): Promise<{ status: number; data: Record<string, unknown> }> {
      const type = normalizeConfigType(input.query?.get("type") ?? input.body?.type, true);
      if (input.method === "GET" && !input.route.configId) {
        return {
          status: 200,
          data: {
            configs: await listCanvasUserConfigs(db, {
              userId: input.ownerUserId,
              type: type ?? undefined,
              includeArchived: input.query?.get("includeArchived") === "true",
              limit: Number(input.query?.get("limit") ?? 100),
            }),
          },
        };
      }
      if (!input.canManage && input.method !== "GET") throw new Error("canvas_user_config_manage_forbidden");
      if (input.method === "POST" && !input.route.configId) {
        const created = await createCanvasUserConfig(db, {
          userId: input.ownerUserId,
          actorUserId: input.actorUserId,
          type: normalizeConfigType(input.body?.type, false)!,
          name: String(input.body?.name ?? ""),
          manifest: input.body?.manifest,
          now: input.now,
        });
        return { status: 201, data: created };
      }
      if (input.method === "GET" && input.route.configId && input.route.versions) {
        return {
          status: 200,
          data: {
            versions: await listCanvasUserConfigVersions(db, {
              userId: input.ownerUserId,
              configId: input.route.configId,
              limit: Number(input.query?.get("limit") ?? 100),
            }),
          },
        };
      }
      if (input.method === "POST" && input.route.configId && input.route.versions) {
        const version = await createCanvasUserConfigVersion(db, {
          userId: input.ownerUserId,
          configId: input.route.configId,
          actorUserId: input.actorUserId,
          manifest: input.body?.manifest,
          now: input.now,
        });
        return { status: 201, data: { version } };
      }
      if (input.method === "GET" && input.route.configId) {
        const snapshot = await resolveCanvasUserConfigSnapshot(db, {
          userId: input.ownerUserId,
          configId: input.route.configId,
          versionId: String(input.query?.get("versionId") ?? "").trim() || null,
          expectedType: type ?? undefined,
        });
        return { status: 200, data: { snapshot } };
      }
      if (input.method === "DELETE" && input.route.configId) {
        const archived = await archiveCanvasUserConfig(db, {
          userId: input.ownerUserId,
          configId: input.route.configId,
          now: input.now,
        });
        if (!archived) throw new Error("canvas_user_config_not_found");
        return { status: 200, data: { archivedConfigId: input.route.configId } };
      }
      throw new Error("method_not_allowed");
    },
  };
}

function normalizeConfigType(value: unknown, optional: boolean): CanvasUserConfigType | null {
  const type = String(value ?? "").trim();
  if (!type && optional) return null;
  if (type !== "style" && type !== "skill" && type !== "toolbar" && type !== "slash_command" && type !== "preset") {
    throw new CanvasUserConfigError("canvas_user_config_type_invalid");
  }
  return type;
}

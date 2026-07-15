import { createHash, randomUUID } from "node:crypto";
import { normalizeCnPhone } from "../identity/phone-auth.utils.ts";

import { appendAuditEvent, type AuditEventRecord } from "../audit/audit.service.ts";
import { hasExternalProviderSubmissionStartedForTask } from "../model-gateway/provider-request.service.ts";
import { resolveUserActorContext, type UserActorContext } from "../identity/user-actor-context.service.ts";
import { capabilities, type Capability } from "../../../../../packages/contracts/domain/capabilities.ts";
import { operationNames, type OperationName } from "../../../../../packages/contracts/domain/operation-names.ts";
import {
  createTeamMember as createTeamMemberRecord,
  ensureUserTeamAccountSuffix,
  getTeamOverview as getTeamOverviewRecord,
  listTeamMembers as listTeamMemberRecords,
  TeamServiceError,
  updateTeamMember as updateTeamMemberRecord,
} from "../identity/team.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  beginOrReplayCommand,
  IdempotencyConflictError,
  IdempotencyProcessingError,
} from "../shared/idempotency/idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../shared/idempotency/persistent-idempotency.store.ts";
import {
  aggregateWorkflowStatus,
  claimQueuedTask,
  finalizeTaskAttempt,
} from "../workflow-task/workflow-task.service.ts";
import {
  ensureDefaultOfficialLibraryAssets,
  listLibraryAssetsForActor,
  type LibraryAssetCategory,
  type LibraryAssetScope,
} from "./asset-library.service.ts";
import {
  buildSignedObjectUrls,
  deleteStorageObjectRecord,
  findStorageObject,
} from "../storage/storage.service.ts";
import {
  findUploadSession,
  type UploadSessionRuntime,
} from "../storage/upload-session.service.ts";
import {
  createAssetVersionSnapshot,
  upsertAssetVersionSnapshot,
} from "./asset-version-record.service.ts";
import type { AssetType } from "./asset.service.ts";
import { computeAssetReviewSummary } from "./asset-review.service.ts";
import {
  assetReviewStateFromRecords,
  confirmAllAssetReviewCandidateRecords,
  confirmAssetReviewCandidateRecord,
  listAssetReviewCandidatesForProject,
  replaceAssetReviewCandidatesForProject,
  updateAssetReviewCandidateRecordLabel,
} from "./asset-review-record.service.ts";
import {
  getLatestCalibrationSessionForProject,
  replaceCalibrationSessionForProject,
} from "./calibration-record.service.ts";
import { CreatorDevApp, type CreatorDevStateSnapshot } from "./creator-dev-app.ts";
import {
  ensureCreatorSqlState,
  getCreatorDevState,
  type CreatorSqlState,
} from "./creator-dev-state.service.ts";
import {
  hydrateStateFromSql,
  loadProjectBundleFromSql,
  seedCreatorAppFromSql,
} from "./creator-state-hydration.service.ts";
import { CalibrationRuleError } from "./calibration.service.ts";
import {
  createEpisodeForProject,
  createEpisodeForProjectWithId,
  deleteEpisodeForProject,
  listEpisodesForProject,
  replaceEpisodesForProject,
  updateEpisodeForProject,
} from "./episode-record.service.ts";
import {
  createScriptReaderSection,
  deleteScriptReaderSection,
  ensureScriptReaderSectionsForProject,
  listScriptReaderSectionsForProject,
  updateScriptReaderSection,
} from "./script-reader-section-record.service.ts";
import {
  deleteScriptCardRecord,
  updateScriptCardRecord,
} from "./script-card-record.service.ts";
import { upsertEpisodeGenerationDraft } from "./episode-generation-draft.service.ts";
import {
  createCreatorExportArtifact,
  requestCreatorImageGenerationPlatformBatch,
  requestCreatorVideoGenerationPlatformBatch,
} from "./creator-platform.service.ts";
import {
  createExportRecord,
  listExportRecordsForProject,
} from "./export-record.service.ts";
import {
  claimShotImageRetryForTask,
  claimShotVideoRetryForTask,
  listShotsForProject,
  releaseShotImageRetryClaim,
  releaseShotVideoRetryClaim,
  replaceShotsForProject,
  upsertShotsForProject,
} from "./shot-record.service.ts";
import {
  listShotReferencesForProject,
  replaceShotReferencesForShot,
} from "./shot-reference-record.service.ts";
import {
  createSqlParseScriptCommandHandler,
  createSqlProjectCommandHandler,
} from "./sql-project.command.ts";
import type { ProjectBundle, ProjectRecord, ScriptRecord } from "./project.service.ts";
import type { ShotRecord } from "./shot.service.ts";

const DEFAULT_CREATOR_PROJECT_PAGE_SIZE = 18;
const MAX_CREATOR_PROJECT_PAGE_SIZE = 100;

interface AuthenticatedCreatorUser {
  id: string;
  sessionToken: string;
}

async function createScriptForReaderSections(
  db: SqlDatabase,
  input: {
    projectId: string;
    title: string;
    inputText: string;
    createdByUserId: string;
    now: Date;
  },
): Promise<ScriptRecord> {
  const scriptId = randomUUID();
  const result = await db.query<{
    id: string;
    project_id: string;
    title: string | null;
    cover_image_url: string | null;
    cover_storage_object_id: string | null;
    deleted_at: Date | string | null;
    status: "draft" | "ready" | "parsed" | "failed";
    input_text: string;
    created_by_user_id: string;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      INSERT INTO scripts (
        id,
        project_id,
        title,
        status,
        input_text,
        created_by_user_id,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, 'ready', $4, $5, $6, $6)
      RETURNING *
    `,
    [
      scriptId,
      input.projectId,
      input.title.trim() || "剧本",
      input.inputText,
      input.createdByUserId,
      input.now,
    ],
  );
  const script = result.rows[0];
  if (!script) {
    throw new Error("script_create_failed");
  }
  return {
    id: script.id,
    projectId: script.project_id,
    title: script.title,
    coverImageUrl: script.cover_image_url,
    coverStorageObjectId: script.cover_storage_object_id,
    deletedAt: script.deleted_at ? new Date(script.deleted_at) : null,
    status: script.status,
    inputText: script.input_text,
    createdByUserId: script.created_by_user_id,
    createdAt: new Date(script.created_at),
    updatedAt: new Date(script.updated_at),
  };
}

function splitScriptDocumentIntoChapterSections(scriptText: string) {
  const normalized = String(scriptText ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  const chapterPattern = /(^|\n)\s*((?:第\s*(?:\d+|[零〇一二三四五六七八九十百千万两]+)\s*章)[^\n]*)/g;
  const matches = [...normalized.matchAll(chapterPattern)];
  if (!matches.length) {
    return [{ title: "第 1 集", body: normalized }];
  }
  return matches.map((match, index) => {
    const title = match[2]?.trim() || `第 ${index + 1} 集`;
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    const next = matches[index + 1];
    const end = next?.index ?? normalized.length;
    return {
      title,
      body: normalized.slice(start, end).trim(),
    };
  }).filter((section) => section.body);
}

function splitScriptDocumentIntoChapterSectionsStable(scriptText: string) {
  const normalized = String(scriptText ?? "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  const chapterPattern = /(^|\n)\s*((?:\u7b2c\s*(?:\d+|[\u96f6\u3007\u4e00\u4e8c\u4e09\u56db\u4e94\u516d\u4e03\u516b\u4e5d\u5341\u767e\u5343\u4e07\u4e24]+)\s*\u7ae0)[^\n]*)/g;
  const matches = [...normalized.matchAll(chapterPattern)];
  if (!matches.length) {
    return [{ title: "\u7b2c 1 \u96c6", body: normalized }];
  }
  return matches.map((match, index) => {
    const title = match[2]?.trim() || `\u7b2c ${index + 1} \u96c6`;
    const start = (match.index ?? 0) + (match[1]?.length ?? 0);
    const next = matches[index + 1];
    const end = next?.index ?? normalized.length;
    return {
      title,
      body: normalized.slice(start, end).trim(),
    };
  }).filter((section) => section.body);
}

export interface CreatorHttpResponse<T> {
  status: number;
  body: T;
}

interface CreatorApplicationDeps {
  db: SqlDatabase;
  creatorApps?: Map<string, CreatorDevApp>;
  creatorSqlStates?: Map<string, CreatorSqlState>;
  storageRuntime?: UploadSessionRuntime;
  signedUrlExpiresInSeconds?: number;
}

export function createCreatorApplication(deps: CreatorApplicationDeps) {
  const creatorApps = deps.creatorApps ?? new Map<string, CreatorDevApp>();
  const creatorSqlStates = deps.creatorSqlStates ?? new Map<string, CreatorSqlState>();
  const signedUrlExpiresInSeconds =
    deps.signedUrlExpiresInSeconds ??
    Number(
      process.env.STORAGE_SIGNED_URL_EXPIRES_SECONDS ??
      process.env.CREATOR_SIGNED_URL_EXPIRES_SECONDS ??
      900,
    );

  function getCreatorState(userId: string) {
    return getCreatorDevState({ userId, creatorApps, creatorSqlStates });
  }

  function requireStorageRuntime() {
    if (!deps.storageRuntime) {
      throw new Error("storage_runtime_missing");
    }
    return deps.storageRuntime;
  }

  function isLegacyInlineDataUrl(value: string | null | undefined) {
    return typeof value === "string" && value.trim().startsWith("data:");
  }

  async function resolveImportedStorageObject(
    user: AuthenticatedCreatorUser,
    input: {
      projectId: string;
      uploadSessionId?: string | null;
      storageObjectId?: string | null;
    },
    now: Date,
  ) {
    const runtime = deps.storageRuntime;
    if (!runtime) {
      return null;
    }

    if (input.uploadSessionId) {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: user.sessionToken,
        projectId: input.projectId,
        now,
      });
      const uploadSession = await findUploadSession(deps.db, input.uploadSessionId);
      if (!uploadSession || uploadSession.userId !== actor.userId) {
        throw new Error("upload_session_not_found");
      }
      if (uploadSession.status !== "uploaded") {
        throw new Error("upload_session_not_ready");
      }
      const object = await findStorageObject(deps.db, uploadSession.storageObjectId);
      if (!object || object.status !== "available") {
        throw new Error("storage_upload_not_ready");
      }
      const urls = await buildSignedObjectUrls(deps.db, {
        sessionToken: user.sessionToken,
        storageObjectId: object.id,
        adapter: runtime.adapter,
        now,
        expiresInSeconds: signedUrlExpiresInSeconds,
      });
      return {
        id: object.id,
        objectKey: object.objectKey,
        sourceUrl: urls.sourceUrl,
      };
    }

    if (input.storageObjectId) {
      const object = await findStorageObject(deps.db, input.storageObjectId);
      if (!object || object.status !== "available") {
        throw new Error("storage_upload_not_ready");
      }
      const urls = await buildSignedObjectUrls(deps.db, {
        sessionToken: user.sessionToken,
        storageObjectId: object.id,
        adapter: runtime.adapter,
        now,
        expiresInSeconds: signedUrlExpiresInSeconds,
      });
      return {
        id: object.id,
        objectKey: object.objectKey,
        sourceUrl: urls.sourceUrl,
      };
    }

    return null;
  }

  async function ensureSqlState(userId: string, sqlState: CreatorSqlState) {
    return ensureCreatorSqlState({
      db: deps.db,
      userId,
      sqlState,
    });
  }

  async function hydrateActiveCreatorApp(input: {
    user: AuthenticatedCreatorUser;
    creatorApp: CreatorDevApp;
    sqlState: CreatorSqlState;
    now: Date;
  }) {
    await ensureSqlState(input.user.id, input.sqlState);
    if (!input.sqlState.projectId) {
      return null;
    }

    return seedCreatorAppFromSql(deps.db, input.creatorApp, {
      projectId: input.sqlState.projectId,
      scriptId: input.sqlState.scriptId,
      sessionToken: input.user.sessionToken,
      now: input.now,
    });
  }

  async function writeLibraryAsset(input: {
    user: AuthenticatedCreatorUser;
    body: {
      projectId?: string | null;
      kind: "character" | "scene" | "prop" | "image" | "video";
      name?: string | null;
      description?: string | null;
      uploadSessionId?: string | null;
      storageObjectId?: string | null;
      storageObjectKey?: string | null;
      sourceUrl?: string | null;
      mimeType?: string | null;
      width?: number | null;
      height?: number | null;
      prompt?: string | null;
      model?: string | null;
    };
    now: Date;
    source: "import" | "generated";
  }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
    const { creatorApp, sqlState } = getCreatorState(input.user.id);
    await ensureSqlState(input.user.id, sqlState);
    const state = await creatorApp.getState();
    const requestedProjectId = String(input.body.projectId ?? "").trim() || null;
    const projectId = requestedProjectId ?? sqlState.projectId ?? state.project?.id ?? null;
    if (!projectId) {
      return { status: 409, body: { error: "creator_project_missing" } };
    }
    const name = input.body.name?.trim();
    if (!name) {
      return {
        status: 400,
        body: { error: "invalid_asset_input", fieldErrors: { name: "name_required" } },
      };
    }
    const actor = await resolveUserActorContext(deps.db, {
      sessionToken: input.user.sessionToken,
      projectId,
      now: input.now,
    });
      if (
        deps.storageRuntime &&
        input.source === "import" &&
        !input.body.uploadSessionId &&
        !input.body.storageObjectId
      ) {
        return {
          status: 400,
          body: { error: "upload_reference_required" },
        };
      }
    const resolvedUpload = await resolveImportedStorageObject(input.user, {
      projectId,
      uploadSessionId: input.body.uploadSessionId ?? null,
      storageObjectId: input.body.storageObjectId ?? null,
    }, input.now);
    const assetType = assetTypeForKind(input.body.kind);
    const assetKey = `${input.body.kind}-${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")}-${randomUUID().slice(0, 8)}`;
    const asset = {
      id: randomUUID(),
      projectId,
      assetType,
      assetKey,
      createdByUserId: actor.userId,
      createdAt: input.now,
      updatedAt: input.now,
    };
    const version = {
      id: randomUUID(),
      assetId: asset.id,
      versionNumber: 1,
      storageObjectId: resolvedUpload?.id ?? input.body.storageObjectId?.trim() ?? null,
      storageObjectKey:
        resolvedUpload?.objectKey ||
        input.body.storageObjectKey?.trim() ||
        `library/${projectId}/${assetType}/${assetKey}`,
      metadata: {
        mimeType: input.body.mimeType?.trim() || (input.body.kind === "video" ? "video/mp4" : "image/png"),
        width: input.body.width ?? 1024,
        height: input.body.height ?? 1024,
        source: input.source,
        prompt: input.body.prompt ?? null,
        model: input.body.model ?? null,
        label: name,
        description: input.body.description?.trim() || null,
        sourceUrl: resolvedUpload?.sourceUrl ?? (input.body.sourceUrl?.trim() || null),
        previewUrl:
          resolvedUpload?.sourceUrl ||
          input.body.sourceUrl?.trim() ||
          (input.body.storageObjectKey?.trim().startsWith("data:")
            ? input.body.storageObjectKey.trim()
            : null),
      },
      sourceTaskId: randomUUID(),
      sourceAttemptId: randomUUID(),
      createdByUserId: actor.userId,
      createdAt: input.now,
    };
    await upsertAssetVersionSnapshot(deps.db, {
      asset,
      version,
      now: input.now,
    });

    return {
      status: 200,
      body: {
        asset,
        version,
      },
    };
  }

  return {
    async getTeamOverview(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      try {
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          now: input.now,
        });
        const overview = await getTeamOverviewRecord(deps.db, {
          actor,
          now: input.now,
        });

        return {
          status: 200,
          body: overview,
        };
      } catch (error) {
        if (isTeamPermissionMissing(error)) {
          return {
            status: 200,
            body: await getLimitedTeamOverview(deps.db, {
              sessionToken: input.user.sessionToken,
              now: input.now,
            }),
          };
        }
        return teamServiceErrorResponse(error);
      }
    },

    async createTeamMember(input: {
      user: AuthenticatedCreatorUser;
      body: {
        teamAccount?: string | null;
        memberAccount?: string | null;
        displayName?: string | null;
        memberName?: string | null;
        password?: string | null;
        memberGroupId?: string | null;
        projectIds?: string[] | null;
        scriptIds?: string[] | null;
        canvasIds?: string[] | null;
        initialCredits?: number | null;
        memberCredits?: number | null;
        remark?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      try {
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          now: input.now,
        });
        const created = await createTeamMemberRecord(deps.db, {
          actor,
          teamAccount: input.body.memberAccount ?? input.body.teamAccount ?? "",
          displayName: input.body.memberName ?? input.body.displayName ?? "",
          password: input.body.password ?? null,
          memberGroupId: input.body.memberGroupId ?? null,
          projectIds: Array.isArray(input.body.projectIds) ? input.body.projectIds : [],
          scriptIds: Array.isArray(input.body.scriptIds) ? input.body.scriptIds : [],
          canvasIds: Array.isArray(input.body.canvasIds) ? input.body.canvasIds : [],
          initialCredits: input.body.memberCredits ?? input.body.initialCredits ?? 0,
          remark: input.body.remark ?? null,
          now: input.now,
        });

        return {
          status: 200,
          body: created,
        };
      } catch (error) {
        return teamServiceErrorResponse(error);
      }
    },

    async listTeamMembers(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      try {
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          now: input.now,
        });
        const members = await listTeamMemberRecords(deps.db, { actor });

        return {
          status: 200,
          body: { members },
        };
      } catch (error) {
        if (isTeamPermissionMissing(error)) {
          return {
            status: 200,
            body: { members: [] },
          };
        }
        return teamServiceErrorResponse(error);
      }
    },

    async updateTeamMember(input: {
      user: AuthenticatedCreatorUser;
      memberId: string;
      body: {
        displayName?: string | null;
        projectIds?: string[] | null;
        scriptIds?: string[] | null;
        canvasIds?: string[] | null;
        newPassword?: string | null;
        status?: "active" | "disabled" | "deleted" | null;
        creditAdjustmentType?: "increase" | "deduct" | null;
        creditAmount?: number | null;
        remark?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      try {
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          now: input.now,
        });
        const member = await updateTeamMemberRecord(deps.db, {
          actor,
          memberId: input.memberId,
          displayName: input.body.displayName ?? null,
          projectIds: Array.isArray(input.body.projectIds) ? input.body.projectIds : null,
          scriptIds: Array.isArray(input.body.scriptIds) ? input.body.scriptIds : null,
          canvasIds: Array.isArray(input.body.canvasIds) ? input.body.canvasIds : null,
          newPassword: input.body.newPassword ?? null,
          status: input.body.status ?? null,
          creditAdjustmentType: input.body.creditAdjustmentType ?? null,
          creditAmount: input.body.creditAmount ?? null,
          remark: input.body.remark ?? null,
          now: input.now,
        });

        if (!member) {
          return {
            status: 404,
            body: {
              error: "member_not_found",
            },
          };
        }

        return {
          status: 200,
          body: { member },
        };
      } catch (error) {
        return teamServiceErrorResponse(error);
      }
    },

    async updateTeamMember(input: {
      user: AuthenticatedCreatorUser;
      memberId: string;
      body: {
        displayName?: string | null;
        projectIds?: string[] | null;
        scriptIds?: string[] | null;
        canvasIds?: string[] | null;
        newPassword?: string | null;
        status?: "active" | "disabled" | "deleted" | null;
        creditAdjustmentType?: "increase" | "deduct" | null;
        creditAmount?: number | null;
        remark?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      try {
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          now: input.now,
        });
        const member = await updateTeamMemberRecord(deps.db, {
          actor,
          memberId: input.memberId,
          displayName: input.body.displayName ?? null,
          projectIds: Array.isArray(input.body.projectIds) ? input.body.projectIds : null,
          scriptIds: Array.isArray(input.body.scriptIds) ? input.body.scriptIds : null,
          canvasIds: Array.isArray(input.body.canvasIds) ? input.body.canvasIds : null,
          newPassword: input.body.newPassword ?? null,
          status: input.body.status ?? null,
          creditAdjustmentType: input.body.creditAdjustmentType ?? null,
          creditAmount: input.body.creditAmount ?? null,
          remark: input.body.remark ?? null,
          now: input.now,
        });

        if (!member) {
          return {
            status: 404,
            body: {
              error: "member_not_found",
            },
          };
        }

        return {
          status: 200,
          body: { member },
        };
      } catch (error) {
        return teamServiceErrorResponse(error);
      }
    },

    async getState(input: {
      user: AuthenticatedCreatorUser;
    }): Promise<CreatorHttpResponse<CreatorDevStateSnapshot>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      if (sqlState.projectId) {
        await seedCreatorAppFromSql(deps.db, creatorApp, {
          projectId: sqlState.projectId,
          scriptId: sqlState.scriptId,
          sessionToken: input.user.sessionToken,
          now: new Date(),
        });
      }
      const state = await creatorApp.getState();
      const hydrated = sqlState.projectId
        ? await hydrateStateFromSql(deps.db, state, {
            projectId: sqlState.projectId,
            scriptId: sqlState.scriptId,
            sessionToken: input.user.sessionToken,
            now: new Date(),
          })
        : state;
      return {
        status: 200,
        body: hydrated,
      };
    },

    async listUserScripts(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
      page?: number;
      pageSize?: number | string | null;
      includeUntitled?: boolean;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        now: input.now,
      });
      const page = normalizeUserScriptPage(input.page);
      const pageSize = normalizeUserScriptPageSize(input.pageSize);
      const visibleScriptIds = actor.teamMember?.id
        ? await listTeamMemberScriptIds(deps.db, {
            userId: actor.userId,
            memberId: actor.teamMember.id,
          })
        : null;
      const scripts = await listScriptsForUser(deps.db, {
        userId: actor.userId,
        page,
        pageSize,
        includeUntitled: input.includeUntitled === true,
        visibleScriptIds,
      });
      const total = scripts.total;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const currentPage = Math.min(page, totalPages);
      const signedScripts = deps.storageRuntime
        ? await Promise.all(
            scripts.scripts.map((script) =>
              hydrateScriptCoverUrl(deps.db, {
                script,
                sessionToken: input.user.sessionToken,
                runtime: deps.storageRuntime,
                now: input.now,
                signedUrlExpiresInSeconds,
              }),
            ),
          )
        : scripts.scripts;

      return {
        status: 200,
        body: {
          scripts: signedScripts,
          pagination: {
            page: currentPage,
            pageSize,
            total,
            totalPages,
          },
        },
      };
    },

    async createProject(input: {
      user: AuthenticatedCreatorUser;
      body: {
        name: string;
        scriptInput: string;
        aspectRatio: string;
        resolution: string;
      };
      now: Date;
      idempotencyKey: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      const handleCreateProject = createSqlProjectCommandHandler({ db: deps.db });
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        now: input.now,
      });
      if (actor.teamMember) {
        return {
          status: 403,
          body: {
            error: "permission_denied",
            details: {
              reason: "member_project_create_forbidden",
            },
          },
        };
      }
      const result = await handleCreateProject({
        auth: { sessionToken: input.user.sessionToken },
        body: {
          name: input.body.name,
          scriptInput: input.body.scriptInput,
          aspectRatio: input.body.aspectRatio,
          resolution: input.body.resolution,
        },
        idempotencyKey: input.idempotencyKey,
        now: input.now,
      });

      if (result.status !== 200 || !("project" in result.body)) {
        return result as CreatorHttpResponse<Record<string, unknown>>;
      }

      sqlState.projectId = result.body.project.id;
      sqlState.scriptId = result.body.script.id;
      const bundle = await loadProjectBundleFromSql(deps.db, {
        projectId: result.body.project.id,
        scriptId: result.body.script.id,
      });
      await creatorApp.createProject({
        ...input.body,
        seedBundle: bundle ?? undefined,
      });

      return {
        status: result.status,
        body: {
          ...result.body,
          state: await creatorApp.getState(),
        },
      };
    },

    async importScriptDocument(input: {
      user: AuthenticatedCreatorUser;
      body: {
        title?: string | null;
        scriptInput: string;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        now: input.now,
      });
      if (actor.teamMember) {
        return {
          status: 403,
          body: {
            error: "permission_denied",
            details: {
              reason: "member_script_import_forbidden",
            },
          },
        };
      }
      const scriptInput = String(input.body.scriptInput ?? "").trim();
      if (!scriptInput) {
        return { status: 400, body: { error: "script_text_required" } };
      }

      const title = input.body.title?.trim() || "导入剧本";
      const projectId = randomUUID();
      await deps.db.query(
        `
          INSERT INTO projects (
            id,
            name,
            aspect_ratio,
            resolution,
            phase,
            owner_user_id,
            created_by_user_id,
            created_at,
            updated_at
          )
          VALUES ($1, $2, '9:16', '1080p', 'script_input', $3, $3, $4, $4)
        `,
        [
          projectId,
          title,
          actor.userId,
          input.now,
        ],
      );
      const script = await createScriptForReaderSections(deps.db, {
        projectId,
        title,
        inputText: scriptInput,
        createdByUserId: actor.userId,
        now: input.now,
      });
      const sections = splitScriptDocumentIntoChapterSectionsStable(scriptInput);
      const savedSections = [];
      for (const section of sections) {
        savedSections.push(await createScriptReaderSection(deps.db, {
          projectId,
          scriptId: script.id,
          title: section.title,
          body: section.body,
          createdByUserId: actor.userId,
          now: input.now,
        }));
      }

      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      sqlState.projectId = projectId;
      sqlState.scriptId = script.id;
      const detail = await buildProjectDetail(deps.db, {
        projectId,
        sessionToken: input.user.sessionToken,
        runtime: deps.storageRuntime,
        signedUrlExpiresInSeconds,
        now: input.now,
      });
      const bundle = await loadProjectBundleFromSql(deps.db, {
        projectId,
        scriptId: script.id,
      });
      if (bundle) {
        await creatorApp.createProject({
          name: title,
          scriptInput,
          aspectRatio: "9:16",
          resolution: "1080p",
          seedBundle: bundle,
        });
      }

      return {
        status: 200,
        body: {
          project: detail.project,
          script,
          sections: savedSections,
          state: {
            ...(await creatorApp.getState()),
            projectDetail: detail,
          },
        },
      };
    },

    async listProjects(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
      page?: number;
      pageSize?: number | string | null;
      keyword?: string | null;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        now: input.now,
      });
      const page = normalizeCreatorProjectPage(input.page);
      const pageSize = normalizeCreatorProjectPageSize(input.pageSize);
      const keyword = normalizeCreatorProjectKeyword(input.keyword);
      const visibleProjectIds = actor.teamMember?.id
        ? await listTeamMemberProjectIds(deps.db, {
            userId: actor.userId,
            memberId: actor.teamMember.id,
          })
        : null;
      const projectPage = await listProjectsForUser(deps.db, {
        ownerUserId: actor.userId,
        page,
        pageSize,
        keyword,
        visibleProjectIds,
      });
      const signedProjects = deps.storageRuntime
        ? await Promise.all(
            projectPage.projects.map((project) =>
              hydrateProjectCoverUrl(deps.db, {
                project,
                sessionToken: input.user.sessionToken,
                runtime: deps.storageRuntime!,
                now: input.now,
                signedUrlExpiresInSeconds,
              }),
            ),
          )
        : projectPage.projects;
      const totalPages = Math.max(1, Math.ceil(projectPage.total / projectPage.pageSize));
      return {
        status: 200,
        body: {
          projects: signedProjects,
          pagination: {
            page: projectPage.page,
            pageSize: projectPage.pageSize,
            total: projectPage.total,
            totalPages,
          },
        },
      };
    },

    async selectProject(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        now: input.now,
      });
      const bundle = await loadProjectBundleFromSql(deps.db, {
        projectId: input.projectId,
        scriptId: null,
      });
      if (!bundle || !(await isProjectVisibleToActor(deps.db, { actor, projectId: input.projectId, projectOwnerUserId: bundle.project?.createdByUserId ?? null }))) {
        return { status: 404, body: { error: "project_not_found" } };
      }

      sqlState.projectId = input.projectId;
      sqlState.scriptId = bundle.script?.id ?? null;
      await creatorApp.createProject({
        name: bundle.project?.name ?? "未命名项目",
        scriptInput: bundle.script?.inputText ?? "",
        aspectRatio: bundle.project?.aspectRatio ?? "9:16",
        resolution: bundle.project?.resolution ?? "1080p",
        seedBundle: bundle as ProjectBundle,
      });
      const shots = await listShotsForProject(deps.db, {
        projectId: input.projectId,
      });
      await creatorApp.seedShotRecords(
        shots,
      );

      return {
        status: 200,
        body: await buildProjectDetail(deps.db, {
          projectId: input.projectId,
          sessionToken: input.user.sessionToken,
          runtime: deps.storageRuntime,
          signedUrlExpiresInSeconds,
          now: input.now,
          projectBundle: bundle as ProjectBundle,
          shots,
        }),
      };
    },

    async getProjectDetail(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        now: input.now,
      });
      const projectBundle = await loadProjectBundleFromSql(deps.db, {
        projectId: input.projectId,
        scriptId: null,
      });
      if (!projectBundle || !(await isProjectVisibleToActor(deps.db, { actor, projectId: input.projectId, projectOwnerUserId: projectBundle.project?.createdByUserId ?? null }))) {
        return { status: 404, body: { error: "project_not_found" } };
      }
      const detail = await buildProjectDetail(deps.db, {
        projectId: input.projectId,
        sessionToken: input.user.sessionToken,
        runtime: deps.storageRuntime,
        signedUrlExpiresInSeconds,
        now: input.now,
        projectBundle,
      });
      if (!detail.project) {
        return { status: 404, body: { error: "project_not_found" } };
      }
      return {
        status: 200,
        body: detail,
      };
    },

    async updateProject(input: {
      user: AuthenticatedCreatorUser;
      body: {
        projectId?: string | null;
        name?: string | null;
        phase?: "script_input" | "asset_review" | "shot_generation" | "export" | null;
        coverImageUrl?: string | null;
        uploadSessionId?: string | null;
        storageObjectId?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const state = await creatorApp.getState();
      const projectId = input.body.projectId ?? sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }

      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      if (
        deps.storageRuntime &&
        input.body.coverImageUrl !== undefined &&
        input.body.coverImageUrl !== null &&
        !input.body.uploadSessionId &&
        !input.body.storageObjectId &&
        !isLegacyInlineDataUrl(input.body.coverImageUrl)
      ) {
        return {
          status: 400,
          body: { error: "cover_upload_reference_required" },
        };
      }
      const resolvedCoverUpload =
        input.body.uploadSessionId || input.body.storageObjectId
          ? await resolveImportedStorageObject(
              input.user,
              {
                projectId,
                uploadSessionId: input.body.uploadSessionId ?? null,
                storageObjectId: input.body.storageObjectId ?? null,
              },
              input.now,
            )
          : null;
      const updated = await updateProjectRecord(deps.db, {
        projectId,
        name: input.body.name,
        phase: input.body.phase,
        coverImageUrl:
          resolvedCoverUpload || input.body.coverImageUrl === null
            ? null
            : input.body.coverImageUrl,
        coverStorageObjectId:
          resolvedCoverUpload?.id ??
          (input.body.coverImageUrl !== undefined ? null : undefined),
        now: input.now,
      });
      if (!updated) {
        return { status: 404, body: { error: "project_not_found" } };
      }
      const hydratedProject = deps.storageRuntime
        ? await hydrateProjectCoverUrl(deps.db, {
            project: updated,
            sessionToken: input.user.sessionToken,
            runtime: deps.storageRuntime!,
            now: input.now,
            signedUrlExpiresInSeconds,
          })
        : updated;
      return {
        status: 200,
        body: { project: hydratedProject },
      };
    },

    async deleteProject(input: {
      user: AuthenticatedCreatorUser;
      body: { projectId?: string | null };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const projectId = input.body.projectId ?? sqlState.projectId;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      await deleteProjectRecord(deps.db, {
        projectId,
        runtime: deps.storageRuntime ?? null,
        now: input.now,
      });
      if (sqlState.projectId === projectId) {
        sqlState.projectId = null;
        sqlState.scriptId = null;
      }
      return { status: 200, body: { deleted: true, projectId } };
    },

    async parseScript(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
      idempotencyKey: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      if (!sqlState.projectId || !sqlState.scriptId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });

      const handleParseScript = createSqlParseScriptCommandHandler({ db: deps.db });
      const result = await handleParseScript({
        auth: { sessionToken: input.user.sessionToken },
        body: {
          projectId: sqlState.projectId,
          scriptId: sqlState.scriptId,
        },
        idempotencyKey: input.idempotencyKey,
        now: input.now,
      });

      if (result.status !== 202) {
        return result as CreatorHttpResponse<Record<string, unknown>>;
      }

      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: sqlState.projectId,
        now: input.now,
      });
      if (result.idempotencyResult === "replayed") {
        const records = await listAssetReviewCandidatesForProject(deps.db, {
          projectId: sqlState.projectId,
        });
        const assetCandidates = assetReviewStateFromRecords(records);
        const shots = await listShotsForProject(deps.db, {
          projectId: sqlState.projectId,
        });
        await creatorApp.seedShotRecords(shots);
        return {
          status: result.status,
          body: {
            workflow: result.body,
            assetReview: computeAssetReviewSummary(assetCandidates),
            assetCandidates,
            shots,
          },
        };
      }

      const parsed = await creatorApp.parseScript({
        episodeIdForSourceId: (sourceEpisodeId) =>
          stableEpisodeUuid(sqlState.projectId!, sourceEpisodeId),
      });
      if (result.body.taskStatus === "queued") {
        const claim = await claimQueuedTask(deps.db, {
          taskId: result.body.taskId,
          workerId: "creator-parse-finalizer",
          now: input.now,
          leaseMs: 60_000,
        });
        if (!claim) {
          throw new Error(`parse_task_claim_failed:${result.body.taskId}`);
        }
        await finalizeTaskAttempt(deps.db, {
          taskId: result.body.taskId,
          attemptId: claim.attempt.id,
          status: "succeeded",
          now: input.now,
          finalize: async () => {
            await replaceAssetReviewCandidatesForProject(deps.db, {
              projectId: sqlState.projectId!,
              now: input.now,
              candidates: parsed.parse.candidateAssets.map((candidate) => ({
                group: candidate.kind,
                assetKey: candidate.id,
                label: candidate.name,
                required: candidate.kind !== "prop",
              })),
            });
            const persistedEpisodes = await replaceEpisodesForProject(deps.db, {
              projectId: sqlState.projectId!,
              createdByUserId: actor.userId,
              now: input.now,
              episodes: parsed.parse.episodes.map((episode) => ({
                id: stableEpisodeUuid(sqlState.projectId!, episode.id),
                title: episode.title,
                sequence: episode.sequence,
                status: "draft",
              })),
            });
            const episodeIdBySourceId = new Map(
              parsed.parse.episodes.map((episode) => [
                episode.id,
                persistedEpisodes.find((persisted) => persisted.sequence === episode.sequence)?.id
                  ?? stableEpisodeUuid(sqlState.projectId!, episode.id),
              ]),
            );
            const shotEpisodeIdByIndex = new Map(
              parsed.parse.shots.map((shot, index) => [
                index,
                episodeIdBySourceId.get(shot.episodeId) ?? null,
              ]),
            );
            await replaceShotsForProject(deps.db, {
              projectId: sqlState.projectId!,
              createdByUserId: actor.userId,
              shots: (parsed.shots as ShotRecord[]).map((shot, index) => ({
                ...shot,
                episodeId: shotEpisodeIdByIndex.get(index) ?? null,
              })),
              now: input.now,
            });
            await deps.db.query(
              `
                UPDATE projects
                SET phase = 'asset_review',
                    updated_at = $2
                WHERE id = $1
              `,
              [sqlState.projectId, input.now],
            );
            await deps.db.query(
              `
                UPDATE scripts
                SET status = 'parsed',
                    updated_at = $2
                WHERE id = $1
              `,
              [sqlState.scriptId, input.now],
            );
          },
        });
        await aggregateWorkflowStatus(deps.db, result.body.workflowId);
      }
      const records = await listAssetReviewCandidatesForProject(deps.db, {
        projectId: sqlState.projectId,
      });
      const assetCandidates = assetReviewStateFromRecords(records);
      return {
        status: result.status,
        body: {
          workflow: result.body,
          ...parsed,
          assetReview: computeAssetReviewSummary(assetCandidates),
          assetCandidates,
        },
      };
    },

    async confirmAllAssets(input: {
      user: AuthenticatedCreatorUser;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      if (sqlState.projectId) {
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const records = await confirmAllAssetReviewCandidateRecords(deps.db, {
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const assetCandidates = assetReviewStateFromRecords(records);
        const assetReview = computeAssetReviewSummary(assetCandidates);
        if (assetReview.readyForGeneration) {
          await updateProjectPhase(deps.db, sqlState.projectId, "shot_generation");
        }
        return {
          status: 200,
          body: {
            assetReview,
            assetCandidates,
          },
        };
      }

      return {
        status: 200,
        body: creatorApp.confirmAllAssets(),
      };
    },

    async confirmAsset(input: {
      user: AuthenticatedCreatorUser;
      body: {
        group: "character" | "scene" | "prop";
        assetKey: string;
      };
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      if (sqlState.projectId) {
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const records = await confirmAssetReviewCandidateRecord(deps.db, {
          projectId: sqlState.projectId,
          group: input.body.group,
          assetKey: input.body.assetKey,
          now: new Date(),
        });
        const assetCandidates = assetReviewStateFromRecords(records);
        const assetReview = computeAssetReviewSummary(assetCandidates);
        if (assetReview.readyForGeneration) {
          await updateProjectPhase(deps.db, sqlState.projectId, "shot_generation");
        }
        return {
          status: 200,
          body: {
            assetReview,
            assetCandidates,
          },
        };
      }

      return {
        status: 200,
        body: creatorApp.confirmAsset(input.body),
      };
    },

    async updateAssetLabel(input: {
      user: AuthenticatedCreatorUser;
      body: {
        group: "character" | "scene" | "prop";
        assetKey: string;
        label: string;
      };
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      if (sqlState.projectId) {
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const records = await updateAssetReviewCandidateRecordLabel(deps.db, {
          projectId: sqlState.projectId,
          group: input.body.group,
          assetKey: input.body.assetKey,
          label: input.body.label,
          now: new Date(),
        });
        const assetCandidates = assetReviewStateFromRecords(records);
        return {
          status: 200,
          body: {
            assetReview: computeAssetReviewSummary(assetCandidates),
            assetCandidates,
          },
        };
      }

      return {
        status: 200,
        body: creatorApp.updateAssetLabel(input.body),
      };
    },

    async listAssetLibrary(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      return {
        status: 200,
        body: {
          assets: await listAssetsForProject(deps.db, {
            projectId,
          }),
        },
      };
    },

    async listReusableAssetLibrary(input: {
      user?: AuthenticatedCreatorUser;
      query?: {
        scope?: string | null;
        category?: string | null;
        folder?: string | null;
        query?: string | null;
        q?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const scope = parseLibraryAssetScope(input.query?.scope);
      const category = parseLibraryAssetCategory(input.query?.category);
      if (!scope || category === "invalid") {
        return {
          status: 400,
          body: {
            error: "invalid_library_filter",
            fieldErrors: {
              ...(scope ? {} : { scope: "invalid_scope" }),
              ...(category === "invalid" ? { category: "invalid_category" } : {}),
            },
          },
        };
      }

      if (scope !== "official" && !input.user) {
        return {
          status: 401,
          body: { error: "unauthenticated" },
        };
      }

      const actor = scope === "official"
        ? undefined
        : await resolveUserActorContext(deps.db, {
            sessionToken: input.user!.sessionToken,
            now: input.now,
          });

      if (scope === "official") {
        await ensureDefaultOfficialLibraryAssets(deps.db, { now: input.now });
      }

      const listed = await listLibraryAssetsForActor(deps.db, {
        actor,
        scope,
        category,
        folder: cleanOptionalText(input.query?.folder),
        query: cleanOptionalText(input.query?.query ?? input.query?.q),
        now: input.now,
      });

      return {
        status: 200,
        body: listed,
      };
    },

    async updateProjectAsset(input: {
      user: AuthenticatedCreatorUser;
      assetId: string;
      body: {
        name?: string | null;
        description?: string | null;
        isMain?: boolean | null;
        previewUrl?: string | null;
        sourceUrl?: string | null;
        downloadUrl?: string | null;
        storageObjectId?: string | null;
        storageObjectKey?: string | null;
        mimeType?: string | null;
        generationTaskId?: string | null;
        generationStatus?: string | null;
        generationResult?: Record<string, unknown> | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const asset = await findProjectAssetById(deps.db, { assetId: input.assetId });
      if (!asset) {
        return { status: 404, body: { error: "asset_not_found" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: asset.projectId,
        now: input.now,
      });
      const updated = await updateProjectAssetRecord(deps.db, {
        assetId: input.assetId,
        name: input.body.name,
        description: input.body.description,
        isMain: input.body.isMain,
        previewUrl: input.body.previewUrl ?? undefined,
        sourceUrl: input.body.sourceUrl ?? undefined,
        downloadUrl: input.body.downloadUrl ?? undefined,
        storageObjectId: input.body.storageObjectId ?? undefined,
        storageObjectKey: input.body.storageObjectKey ?? undefined,
        mimeType: input.body.mimeType ?? undefined,
        generationTaskId: input.body.generationTaskId ?? undefined,
        generationStatus: input.body.generationStatus ?? undefined,
        generationResult: input.body.generationResult ?? undefined,
        now: input.now,
      });
      return updated
        ? { status: 200, body: { asset: updated } }
        : { status: 404, body: { error: "asset_not_found" } };
    },

    async deleteProjectAsset(input: {
      user: AuthenticatedCreatorUser;
      assetId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const asset = await findProjectAssetById(deps.db, { assetId: input.assetId });
      if (!asset) {
        return { status: 404, body: { error: "asset_not_found" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: asset.projectId,
        now: input.now,
      });
      const deleted = await deleteProjectAssetRecord(deps.db, {
        assetId: input.assetId,
      });
      if (deleted?.orphanStorageObjectIds?.length) {
        const runtime = requireStorageRuntime();
        for (const storageObjectId of deleted.orphanStorageObjectIds) {
          await deleteStorageObjectRecord(deps.db, {
            storageObjectId,
            adapter: runtime.adapter,
            localObjectStore: runtime.localObjectStore,
            now: input.now,
          });
        }
      }
      return deleted
        ? { status: 200, body: { deleted: true } }
        : { status: 404, body: { error: "asset_not_found" } };
    },

    async importAsset(input: {
      user: AuthenticatedCreatorUser;
      body: {
        kind: "character" | "scene" | "prop" | "image" | "video";
        projectId?: string | null;
        name?: string | null;
        description?: string | null;
        uploadSessionId?: string | null;
        storageObjectId?: string | null;
        storageObjectKey?: string | null;
        sourceUrl?: string | null;
        mimeType?: string | null;
        width?: number | null;
        height?: number | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      return writeLibraryAsset({
        user: input.user,
        body: input.body,
        now: input.now,
        source: "import",
      });
    },

    async generateAsset(input: {
      user: AuthenticatedCreatorUser;
      body: {
        kind: "character" | "scene" | "prop" | "image" | "video";
        projectId?: string | null;
        name?: string | null;
        prompt?: string | null;
        model?: string | null;
        width?: number | null;
        height?: number | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      return writeLibraryAsset({
        user: input.user,
        body: {
          ...input.body,
          storageObjectKey: `library/${input.body.kind}/${randomUUID()}`,
          mimeType: input.body.kind === "video" ? "video/mp4" : "image/png",
        },
        now: input.now,
        source: "generated",
      });
    },

    async listAssetVersions(input: {
      user: AuthenticatedCreatorUser;
      assetId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        now: input.now,
      });
      const versions = await listAssetVersions(deps.db, {
        assetId: input.assetId,
      });
      const runtime = deps.storageRuntime;
      if (!runtime) {
        return { status: 200, body: { versions } };
      }
      const signedVersions = await Promise.all(
        versions.map(async (version) => ({
          ...version,
          previewUrl: await resolveStorageBackedPreviewUrl(deps.db, {
            sessionToken: input.user.sessionToken,
            storageObjectId: version.storageObjectId ?? null,
            storageObjectKey: version.storageObjectKey,
            metadata: version.metadata ?? null,
            now: input.now,
            runtime,
            signedUrlExpiresInSeconds,
          }),
        })),
      );
      return { status: 200, body: { versions: signedVersions } };
    },

    async listProjectEpisodes(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const detail = await buildProjectDetail(deps.db, {
        projectId: input.projectId,
        sessionToken: input.user.sessionToken,
        runtime: deps.storageRuntime,
        signedUrlExpiresInSeconds,
        now: input.now,
      });
      return { status: 200, body: { episodes: detail.episodes } };
    },

    async listScriptReaderSections(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      scriptId?: string | null;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const scriptId = String(input.scriptId ?? "").trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scriptId)) {
        return { status: 404, body: { error: "script_not_found", message: "剧本不存在，请刷新页面" } };
      }
      const script = await queryOne<{ id: string }>(
        deps.db,
        `
          SELECT id
          FROM scripts
          WHERE project_id = $1
            AND id = $2
            AND deleted_at IS NULL
          LIMIT 1
        `,
        [input.projectId, scriptId],
      );
      if (!script) {
        return { status: 404, body: { error: "script_not_found", message: "剧本不存在，请刷新页面" } };
      }
      const sections = await listScriptReaderSectionsForProject(deps.db, {
        projectId: input.projectId,
        scriptId,
      });
      return { status: 200, body: { sections } };
    },

    async createScriptReaderSection(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      body: {
        title?: string | null;
        body?: string | null;
        scriptInputText?: string | null;
        scriptId?: string | null;
        createNewScript?: boolean | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const bundle = await loadProjectBundleFromSql(deps.db, {
        projectId: input.projectId,
        scriptId: input.body.scriptId ?? null,
      });
      const shouldCreateNewScript = input.body.createNewScript === true;
      const script = shouldCreateNewScript || !bundle?.script
        ? await createScriptForReaderSections(deps.db, {
            projectId: input.projectId,
            title: input.body.title?.trim() || "剧本",
            inputText: input.body.scriptInputText?.trim() || input.body.body || "",
            createdByUserId: actor.userId,
            now: input.now,
          })
        : bundle.script;
      const section = await createScriptReaderSection(deps.db, {
        projectId: input.projectId,
        scriptId: script.id,
        title: input.body.title?.trim() || "新增剧情",
        body: input.body.body ?? "",
        createdByUserId: actor.userId,
        now: input.now,
      });
      return { status: 200, body: { section, script } };
    },

    async updateScriptReaderSection(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      sectionId: string;
      body: {
        title?: string | null;
        body?: string | null;
        status?: "draft" | "ready" | "archived" | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const section = await updateScriptReaderSection(deps.db, {
        projectId: input.projectId,
        sectionId: input.sectionId,
        title: input.body.title,
        body: input.body.body,
        status: input.body.status,
        now: input.now,
      });
      if (!section) {
        return { status: 404, body: { error: "script_reader_section_not_found" } };
      }
      return { status: 200, body: { section } };
    },

    async deleteScriptReaderSection(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      sectionId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const deleted = await deleteScriptReaderSection(deps.db, {
        projectId: input.projectId,
        sectionId: input.sectionId,
      });
      if (!deleted) {
        return { status: 404, body: { error: "script_reader_section_not_found" } };
      }
      return { status: 200, body: { deleted: true } };
    },

    async updateScriptCard(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      scriptId: string;
      body: {
        title?: string | null;
        coverImageUrl?: string | null;
        uploadSessionId?: string | null;
        storageObjectId?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const hasCoverUpdate =
        input.body.coverImageUrl !== undefined ||
        Boolean(input.body.uploadSessionId) ||
        Boolean(input.body.storageObjectId);
      const resolvedCoverUpload =
        !hasCoverUpdate
          ? null
          : await resolveImportedStorageObject(
              input.user,
              {
                projectId: input.projectId,
                uploadSessionId: input.body.uploadSessionId,
                storageObjectId: input.body.storageObjectId,
              },
              input.now,
            );
      const script = await updateScriptCardRecord(deps.db, {
        projectId: input.projectId,
        scriptId: input.scriptId,
        title: input.body.title,
        coverImageUrl: resolvedCoverUpload ? null : input.body.coverImageUrl,
        coverStorageObjectId: resolvedCoverUpload?.id ?? null,
        now: input.now,
      });
      if (!script) {
        return { status: 404, body: { error: "script_not_found" } };
      }
      const hydratedScript = deps.storageRuntime
        ? await hydrateScriptCoverUrl(deps.db, {
            script,
            sessionToken: input.user.sessionToken,
            runtime: deps.storageRuntime,
            now: input.now,
            signedUrlExpiresInSeconds,
          })
        : script;
      return { status: 200, body: { script: hydratedScript } };
    },

    async deleteScriptCard(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      scriptId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const script = await deleteScriptCardRecord(deps.db, {
        projectId: input.projectId,
        scriptId: input.scriptId,
        now: input.now,
      });
      if (!script) {
        return { status: 404, body: { error: "script_not_found" } };
      }
      return { status: 200, body: { deleted: true, script } };
    },

    async listProjectMembers(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      return {
        status: 200,
        body: {
          members: await listProjectMemberCompatibilityRecords(deps.db, {
            userId: actor.userId,
            projectId: input.projectId,
          }),
        },
      };
    },

    async createProjectMember(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      body: {
        phone?: string | null;
        role?: "producer" | "creator" | "viewer" | null;
        note?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });

      if (actor.teamMember) {
        return {
          status: 403,
          body: {
            error: "permission_denied",
            details: {
              reason: "member_create_forbidden",
            },
          },
        };
      }

      let phone = "";
      try {
        phone = normalizeCnPhone(input.body.phone ?? "");
      } catch {
        return {
          status: 400,
          body: {
            error: "invalid_member_input",
            fieldErrors: {
              phone: "invalid_phone",
            },
          },
        };
      }

      const role = String(input.body.role ?? "creator");
      if (!["producer", "creator", "viewer"].includes(role)) {
        return {
          status: 400,
          body: {
            error: "invalid_member_input",
            fieldErrors: {
              role: "invalid_role",
            },
          },
        };
      }

      const note = String(input.body.note ?? "").trim().slice(0, 100);
      const teamAccount = phone.replace(/^\+86/, "");
      const existing = await queryOne<{ id: string }>(deps.db, `
        SELECT id
        FROM team_members
        WHERE user_id = $1
          AND member_account = $2
          AND deleted_at IS NULL
        LIMIT 1
      `, [actor.userId, teamAccount]);
      const created = existing
        ? null
        : await createTeamMemberRecord(deps.db, {
            actor,
            teamAccount,
            displayName: note || phone,
            projectIds: [input.projectId],
            initialCredits: 0,
            now: input.now,
          });
      const memberId = existing?.id ?? created!.member.membershipId;
      await upsertProjectMemberCompatibilityAssignment(deps.db, {
        userId: actor.userId,
        memberId,
        projectId: input.projectId,
        role: role as "producer" | "creator" | "viewer",
        note,
        now: input.now,
      });
      const member = await findProjectMemberCompatibilityRecord(deps.db, {
        userId: actor.userId,
        projectId: input.projectId,
        memberId,
      });

      return {
        status: 200,
        body: {
          member,
          temporaryPassword: created?.temporaryPassword ?? "",
        },
      };
    },

    async updateProjectMember(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      memberId: string;
      body: {
        role?: "producer" | "creator" | "viewer" | null;
        note?: string | null;
        status?: "active" | "disabled" | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });

      if (actor.teamMember) {
        return {
          status: 403,
          body: {
            error: "permission_denied",
            details: {
              reason: "member_update_forbidden",
            },
          },
        };
      }

      const role = input.body.role == null ? null : String(input.body.role);
      if (role != null && !["producer", "creator", "viewer"].includes(role)) {
        return {
          status: 400,
          body: {
            error: "invalid_member_input",
            fieldErrors: {
              role: "invalid_role",
            },
          },
        };
      }

      const status = input.body.status == null ? null : String(input.body.status);
      if (status != null && !["active", "disabled"].includes(status)) {
        return {
          status: 400,
          body: {
            error: "invalid_member_input",
            fieldErrors: {
              status: "invalid_status",
            },
          },
        };
      }

      const note = input.body.note == null ? null : String(input.body.note).trim().slice(0, 100);
      const updated = await updateTeamMemberRecord(deps.db, {
        actor,
        memberId: input.memberId,
        status: status as "active" | "disabled" | null,
        now: input.now,
      });

      if (!updated) {
        return {
          status: 404,
          body: {
            error: "member_not_found",
          },
        };
      }
      const current = await findProjectMemberCompatibilityRecord(deps.db, {
        userId: actor.userId,
        projectId: input.projectId,
        memberId: input.memberId,
      });
      if (!current) {
        return { status: 404, body: { error: "member_not_found" } };
      }
      await upsertProjectMemberCompatibilityAssignment(deps.db, {
        userId: actor.userId,
        memberId: input.memberId,
        projectId: input.projectId,
        role: (role ?? current.role) as "producer" | "creator" | "viewer",
        note: note ?? current.note,
        now: input.now,
      });
      const member = await findProjectMemberCompatibilityRecord(deps.db, {
        userId: actor.userId,
        projectId: input.projectId,
        memberId: input.memberId,
      });

      return {
        status: 200,
        body: {
          member,
        },
      };
    },

    async getProjectStats(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      return {
        status: 200,
        body: {
          stats: await buildProjectStats(deps.db, {
            projectId: input.projectId,
            now: input.now,
          }),
        },
      };
    },

    async createEpisode(input: {
      user: AuthenticatedCreatorUser;
      body: { projectId?: string | null; title?: string | null };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const projectId = input.body.projectId ?? sqlState.projectId;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const title = input.body.title?.trim();
      if (!title) {
        return { status: 400, body: { error: "invalid_episode_input", fieldErrors: { title: "title_required" } } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const episode = await createEpisodeForProject(deps.db, {
        projectId,
        title,
        createdByUserId: actor.userId,
        now: input.now,
      });
      return { status: 200, body: { episode } };
    },

    async commitAiStoryboardPreview(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      body: {
        episodeTitle?: string | null;
        commitPayload?: {
          scriptText?: string | null;
          scenes?: Array<Record<string, unknown>> | null;
          characters?: Array<Record<string, unknown>> | null;
          props?: Array<Record<string, unknown>> | null;
          storyboards?: Array<Record<string, unknown>> | null;
        } | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const projectId = input.projectId || sqlState.projectId;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const payload = input.body.commitPayload;
      if (!payload || typeof payload !== "object") {
        return { status: 400, body: { error: "ai_storyboard_commit_payload_required" } };
      }
      const storyboards = Array.isArray(payload.storyboards) ? payload.storyboards : [];
      if (!storyboards.length) {
        return { status: 400, body: { error: "ai_storyboard_storyboards_required" } };
      }
      const title = input.body.episodeTitle?.trim() || "AI 分镜章节";
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const episode = await createEpisodeForProject(deps.db, {
        projectId,
        title,
        createdByUserId: actor.userId,
        now: input.now,
      });
      sqlState.projectId = projectId;

      const createdAssets = {
        characters: await createAiPreviewEpisodeAssets(deps.db, {
          projectId,
          episodeId: episode.id,
          kind: "character",
          records: Array.isArray(payload.characters) ? payload.characters : [],
          createdByUserId: actor.userId,
          now: input.now,
        }),
        scenes: await createAiPreviewEpisodeAssets(deps.db, {
          projectId,
          episodeId: episode.id,
          kind: "scene",
          records: Array.isArray(payload.scenes) ? payload.scenes : [],
          createdByUserId: actor.userId,
          now: input.now,
        }),
        props: await createAiPreviewEpisodeAssets(deps.db, {
          projectId,
          episodeId: episode.id,
          kind: "prop",
          records: Array.isArray(payload.props) ? payload.props : [],
          createdByUserId: actor.userId,
          now: input.now,
        }),
      };
      const shots = storyboards.map((storyboard, index) =>
        aiPreviewStoryboardToShot({
          projectId,
          episodeId: episode.id,
          storyboard,
          index,
          createdByUserId: actor.userId,
          now: input.now,
        }),
      );
      await upsertShotsForProject(deps.db, {
        projectId,
        createdByUserId: actor.userId,
        shots,
        now: input.now,
      });
      for (let index = 0; index < storyboards.length; index += 1) {
        const storyboard = storyboards[index]!;
        const shot = shots[index]!;
        const imagePrompt =
          firstAiPreviewText(storyboard, ["chapterImagePrompt", "chapter_image_prompt"]) ||
          firstAiPreviewText(storyboard, ["imagePrompt", "image_prompt", "staticImagePrompt", "static_image_prompt"]);
        const videoPrompt =
          firstAiPreviewText(storyboard, ["chapterVideoPrompt", "chapter_video_prompt"]) ||
          firstAiPreviewText(storyboard, ["videoPrompt", "video_prompt", "motionPrompt", "motion_prompt"]);
        if (imagePrompt) {
          await upsertEpisodeGenerationDraft(deps.db, {
            projectId,
            episodeId: episode.id,
            targetType: "storyboard",
            targetId: shot.id,
            mode: "image",
            prompt: imagePrompt,
            payload: { source: "ai_storyboard_preview", storyboard },
            createdByUserId: actor.userId,
            now: input.now,
          });
        }
        if (videoPrompt) {
          await upsertEpisodeGenerationDraft(deps.db, {
            projectId,
            episodeId: episode.id,
            targetType: "storyboard",
            targetId: shot.id,
            mode: "video",
            prompt: videoPrompt,
            payload: { source: "ai_storyboard_preview", storyboard },
            createdByUserId: actor.userId,
            now: input.now,
          });
        }
      }
      await updateProjectPhase(deps.db, projectId, "shot_generation");
      await creatorApp.seedShotRecords(
        await listShotsForProject(deps.db, {
          projectId,
        }),
      );

      return {
        status: 200,
        body: {
          episode,
          assets: createdAssets,
          storyboards: shots,
        },
      };
    },

    async updateEpisode(input: {
      user: AuthenticatedCreatorUser;
      body: {
        projectId?: string | null;
        episodeId?: string | null;
        title?: string | null;
        status?: "draft" | "ready" | "archived" | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const projectId = input.body.projectId ?? sqlState.projectId;
      if (!projectId || !input.body.episodeId) {
        return { status: 400, body: { error: "invalid_episode_input" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const episode = await updateEpisodeForProject(deps.db, {
        projectId,
        episodeId: input.body.episodeId,
        title: input.body.title,
        status: input.body.status,
        now: input.now,
      });
      if (!episode) {
        return { status: 404, body: { error: "episode_not_found" } };
      }
      return { status: 200, body: { episode } };
    },

    async deleteEpisode(input: {
      user: AuthenticatedCreatorUser;
      body: { projectId?: string | null; episodeId?: string | null };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const projectId = input.body.projectId ?? sqlState.projectId;
      if (!projectId || !input.body.episodeId) {
        return { status: 400, body: { error: "invalid_episode_input" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const deleted = await deleteEpisodeForProject(deps.db, {
        projectId,
        episodeId: input.body.episodeId,
      });
      return { status: deleted ? 200 : 404, body: deleted ? { deleted: true } : { error: "episode_not_found" } };
    },

    async createShot(input: {
      user: AuthenticatedCreatorUser;
      body: {
        projectId?: string | null;
        title?: string | null;
        description?: string | null;
        episodeId?: string | null;
        episodeTitle?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      const requestedProjectId = input.body.projectId ?? sqlState.projectId ?? null;
      if (requestedProjectId && sqlState.projectId !== requestedProjectId) {
        sqlState.projectId = requestedProjectId;
      }
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      if (input.body.episodeId) {
        const episodeExists = await episodeExistsForProject(deps.db, {
          projectId,
          episodeId: input.body.episodeId,
        });
        if (!episodeExists) {
          const foreignEpisode = await queryOne<{ id: string }>(
            deps.db,
            "SELECT id FROM episodes WHERE id = $1",
            [input.body.episodeId],
          );
          if (foreignEpisode) {
            return { status: 404, body: { error: "episode_not_found" } };
          }
          const episodeTitle = input.body.episodeTitle?.trim() || "未命名剧集";
          await createEpisodeForProjectWithId(deps.db, {
            projectId,
            episodeId: input.body.episodeId,
            title: episodeTitle,
            createdByUserId: actor.userId,
            now: input.now,
          });
        }
      }
      const result = await creatorApp.createShot(input.body);
      await upsertShotsForProject(deps.db, {
        projectId,
        createdByUserId: actor.userId,
        shots: [result.shot as ShotRecord],
        now: input.now,
      });
      return { status: 200, body: result };
    },

    async updateShot(input: {
      user: AuthenticatedCreatorUser;
      body: {
        shotId: string;
        title?: string | null;
        description?: string | null;
        currentImageAssetVersionId?: string | null;
        currentVideoAssetVersionId?: string | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const result = await creatorApp.updateShot(input.body);
      await upsertShotsForProject(deps.db, {
        projectId,
        createdByUserId: actor.userId,
        shots: [result.shot as ShotRecord],
        now: input.now,
      });
      return { status: 200, body: result };
    },

    async deleteShot(input: {
      user: AuthenticatedCreatorUser;
      body: { shotId: string };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      await creatorApp.seedShotRecords(
        await listShotsForProject(deps.db, {
          projectId,
        }),
      );
      const result = await creatorApp.deleteShot(input.body);
      await deps.db.query(
        `
          DELETE FROM calibration_items
          WHERE shot_id = $1
        `,
        [input.body.shotId],
      );
      await deps.db.query(
        `
          DELETE FROM shot_reference_assets
          WHERE project_id = $1
            AND shot_id = $2
        `,
        [projectId, input.body.shotId],
      );
      await deps.db.query(
        `
          DELETE FROM shots
          WHERE project_id = $1
            AND id = $2
          RETURNING id
        `,
        [projectId, input.body.shotId],
      );
      return { status: 200, body: result };
    },

    async reorderShots(input: {
      user: AuthenticatedCreatorUser;
      body: { shotIds: string[] };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const result = await creatorApp.reorderShots(input.body);
      await upsertShotsForProject(deps.db, {
        projectId,
        createdByUserId: actor.userId,
        shots: result.shots as ShotRecord[],
        now: input.now,
      });
      return { status: 200, body: result };
    },

    async importShotMedia(input: {
      user: AuthenticatedCreatorUser;
      body: {
        shotId: string;
        kind: "image" | "video";
        name?: string | null;
        uploadSessionId?: string | null;
        storageObjectId?: string | null;
        storageObjectKey?: string | null;
        sourceUrl?: string | null;
        mimeType?: string | null;
        width?: number | null;
        height?: number | null;
        durationMs?: number | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const projectId = sqlState.projectId;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }

      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        projectId,
        shotId: input.body.shotId,
      });
      let resolvedShot = shot;
      if (!resolvedShot) {
        const memoryState = await creatorApp.getState();
        const memoryShot = memoryState.shots.find((item) => item.id === input.body.shotId);
        if (memoryShot) {
          resolvedShot = memoryShot as ShotRecord;
          await upsertShotsForProject(deps.db, {
            projectId,
            createdByUserId: actor.userId,
            shots: [resolvedShot],
            now: input.now,
          });
        }
      }
      if (!resolvedShot) {
        return { status: 404, body: { error: "shot_not_found" } };
      }
      if (
        deps.storageRuntime &&
        !input.body.uploadSessionId &&
        !input.body.storageObjectId
      ) {
        return {
          status: 400,
          body: { error: "upload_reference_required" },
        };
      }
      const resolvedUpload = await resolveImportedStorageObject(input.user, {
        projectId,
        uploadSessionId: input.body.uploadSessionId ?? null,
        storageObjectId: input.body.storageObjectId ?? null,
      }, input.now);
      const storageObjectKey = resolvedUpload?.objectKey ?? input.body.storageObjectKey?.trim();
      if (!storageObjectKey) {
        return { status: 400, body: { error: "storage_object_key_required" } };
      }

      const snapshot = await createAssetVersionSnapshot(deps.db, {
        projectId,
        assetType: input.body.kind === "video" ? "shot_video" : "shot_image",
        assetKey: input.body.shotId,
        createdByUserId: actor.userId,
        storageObjectId: resolvedUpload?.id ?? input.body.storageObjectId?.trim() ?? null,
        storageObjectKey,
        metadata: {
          mimeType:
            input.body.mimeType?.trim() ||
            (input.body.kind === "video" ? "video/mp4" : "image/png"),
          width: input.body.width ?? 1024,
          height: input.body.height ?? 1024,
          durationMs: input.body.durationMs ?? null,
          source: "import",
          label: input.body.name?.trim() || (input.body.kind === "video" ? "Uploaded video" : "Uploaded image"),
          sourceUrl: resolvedUpload?.sourceUrl ?? (input.body.sourceUrl?.trim() || null),
          previewUrl:
            resolvedUpload?.sourceUrl ||
            input.body.sourceUrl?.trim() ||
            (storageObjectKey.startsWith("data:") ? storageObjectKey : null),
        },
        sourceTaskId: randomUUID(),
        sourceAttemptId: randomUUID(),
        now: input.now,
      });

      const updated = await updateShotMediaPointer(deps.db, {
        projectId,
        shotId: input.body.shotId,
        kind: input.body.kind,
        assetVersionId: snapshot.version.id,
        now: input.now,
      });
      await updateProjectPhase(deps.db, projectId, "shot_generation");
      await creatorApp.seedShotRecords(
        await listShotsForProject(deps.db, {
          projectId,
        }),
      );

      return {
        status: 200,
        body: {
          shot: updated,
          asset: snapshot.asset,
          version: snapshot.version,
        },
      };
    },

    async deleteShotMedia(input: {
      user: AuthenticatedCreatorUser;
      body: {
        shotId: string;
        kind: "image" | "video";
        assetVersionId: string;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const projectId = sqlState.projectId;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }

      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        projectId,
        shotId: input.body.shotId,
      });
      if (!shot) {
        return { status: 404, body: { error: "shot_not_found" } };
      }

      const deleted = await deleteShotMediaVersionRecord(deps.db, {
        projectId,
        shotId: input.body.shotId,
        kind: input.body.kind,
        assetVersionId: input.body.assetVersionId,
        now: input.now,
      });
      if (!deleted) {
        return { status: 404, body: { error: "shot_media_not_found" } };
      }
      if (deleted.orphanStorageObjectId) {
        const runtime = requireStorageRuntime();
        await deleteStorageObjectRecord(deps.db, {
          storageObjectId: deleted.orphanStorageObjectId,
          adapter: runtime.adapter,
          localObjectStore: runtime.localObjectStore,
          now: input.now,
        });
      }

      await creatorApp.seedShotRecords(
        await listShotsForProject(deps.db, {
          projectId,
        }),
      );

      const refreshedShot = await findProjectShot(deps.db, {
        projectId,
        shotId: input.body.shotId,
      });

      return {
        status: 200,
        body: {
          shot: refreshedShot,
          deletedAssetVersionId: input.body.assetVersionId,
        },
      };
    },

    async replaceShotReferences(input: {
      user: AuthenticatedCreatorUser;
      body: {
        shotId: string;
        items: Array<{
          role: string;
          assetId: string;
          assetVersionId?: string | null;
          sortOrder?: number | null;
        }>;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { sqlState } = getCreatorState(input.user.id);
      await ensureSqlState(input.user.id, sqlState);
      const projectId = sqlState.projectId;
      if (!projectId) {
        return { status: 409, body: { error: "creator_project_missing" } };
      }
      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        projectId,
        shotId: input.body.shotId,
      });
      if (!shot) {
        return { status: 404, body: { error: "shot_not_found" } };
      }
      const references = await replaceShotReferencesForShot(deps.db, {
        projectId,
        shotId: input.body.shotId,
        createdByUserId: actor.userId,
        items: input.body.items ?? [],
        now: input.now,
      });
      return { status: 200, body: { references } };
    },

    async runCalibration(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
      idempotencyKey?: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }
      if (input.idempotencyKey) {
        return runIdempotentCreatorAction(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          capability: capabilities.generationStart,
          operationName: operationNames.calibrationGenerate,
          idempotencyKey: input.idempotencyKey,
          request: { projectId },
          now: input.now,
          execute: async () => runCalibrationAction(),
        });
      }

      return runCalibrationAction();

      async function runCalibrationAction() {
        try {
          const result = await creatorApp.runCalibration();

          const auditEvent = await appendCalibrationAuditEvent(deps.db, {
            sessionToken: input.user.sessionToken,
            projectId,
            calibrationId: result.calibration.id,
            decisionType: result.calibration.decision?.decisionType ?? "passed",
            reason: result.calibration.decision?.reason ?? null,
            shotIds: result.calibration.items.map((item) => item.shotId),
            now: input.now,
          });
          const actor = await resolveUserActorContext(deps.db, {
            sessionToken: input.user.sessionToken,
            projectId,
            now: input.now,
          });
          await replaceCalibrationSessionForProject(deps.db, {
            projectId,
            session: result.calibration,
            now: input.now,
          });

          return {
            status: 200,
            body: {
              ...result,
              auditEvent,
            },
          };
        } catch (error) {
          return calibrationErrorResponse(error);
        }
      }
    },

    async skipCalibration(input: {
      user: AuthenticatedCreatorUser;
      body: {
        reason: string;
      };
      now: Date;
      idempotencyKey?: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }
      if (input.idempotencyKey) {
        return runIdempotentCreatorAction(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          capability: capabilities.projectEdit,
          operationName: operationNames.calibrationSkip,
          idempotencyKey: input.idempotencyKey,
          request: { projectId, reason: input.body.reason },
          now: input.now,
          execute: async () => skipCalibrationAction(),
        });
      }

      return skipCalibrationAction();

      async function skipCalibrationAction() {
        try {
          const result = await creatorApp.skipCalibration({
            reason: input.body.reason,
          });

          const auditEvent = await appendCalibrationAuditEvent(deps.db, {
            sessionToken: input.user.sessionToken,
            projectId,
            calibrationId: result.calibration.id,
            decisionType: "skipped",
            reason: result.calibration.decision?.reason ?? null,
            shotIds: result.calibration.items.map((item) => item.shotId),
            now: input.now,
          });
          const actor = await resolveUserActorContext(deps.db, {
            sessionToken: input.user.sessionToken,
            projectId,
            now: input.now,
          });
          await replaceCalibrationSessionForProject(deps.db, {
            projectId,
            session: result.calibration,
            now: input.now,
          });

          return {
            status: 200,
            body: {
              ...result,
              auditEvent,
            },
          };
        } catch (error) {
          return calibrationErrorResponse(error);
        }
      }
    },

    async overrideCalibration(input: {
      user: AuthenticatedCreatorUser;
      body: {
        reason?: string | null;
      };
      now: Date;
      idempotencyKey?: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id ?? null;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }
      if (input.idempotencyKey) {
        return runIdempotentCreatorAction(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          capability: capabilities.projectEdit,
          operationName: operationNames.calibrationOverride,
          idempotencyKey: input.idempotencyKey,
          request: {
            projectId,
            action: "override",
            reason: input.body.reason ?? null,
          },
          now: input.now,
          execute: async () => overrideCalibrationAction(),
        });
      }

      return overrideCalibrationAction();

      async function overrideCalibrationAction() {
        try {
          const result = await creatorApp.overrideCalibration({
            reason: input.body.reason ?? null,
          });

          const auditEvent = await appendCalibrationAuditEvent(deps.db, {
            sessionToken: input.user.sessionToken,
            projectId,
            calibrationId: result.calibration.id,
            decisionType: "override",
            reason: result.calibration.decision?.reason ?? null,
            shotIds: result.calibration.items.map((item) => item.shotId),
            now: input.now,
          });
          const actor = await resolveUserActorContext(deps.db, {
            sessionToken: input.user.sessionToken,
            projectId,
            now: input.now,
          });
          await replaceCalibrationSessionForProject(deps.db, {
            projectId,
            session: result.calibration,
            now: input.now,
          });

          return {
            status: 200,
            body: {
              ...result,
              auditEvent,
            },
          };
        } catch (error) {
          return calibrationErrorResponse(error);
        }
      }
    },

    async generateProjectShotImages(input: {
      user: AuthenticatedCreatorUser;
      body?: {
        shotId?: string | null;
        promptOverride?: string | null;
        model?: string | null;
        parameters?: Record<string, unknown> | null;
      };
      now: Date;
      idempotencyKey?: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const before = await creatorApp.getState();
      const projectId = sqlState.projectId ?? before.project?.id;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const requestedShots = filterRequestedShots(before.shots, input.body?.shotId);
      if (input.idempotencyKey) {
        return runIdempotentCreatorAction(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          capability: capabilities.generationStart,
          operationName: operationNames.shotImageGenerate,
          idempotencyKey: input.idempotencyKey,
          request: {
            projectId,
            shotIds: requestedShots.map((shot) => shot.id),
            body: input.body ?? {},
          },
          now: input.now,
          execute: async () => generateImagesAction(requestedShots),
        });
      }

      return generateImagesAction(requestedShots);

      async function generateImagesAction(
        selectedShots: CreatorDevStateSnapshot["shots"],
      ) {
        const platform = await requestCreatorImageGenerationPlatformBatch(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
          options: {
            shotId: input.body?.shotId ?? null,
            promptOverride: input.body?.promptOverride ?? null,
            model: input.body?.model ?? null,
            parameters: input.body?.parameters ?? null,
          },
          shots: selectedShots.map((shot) => ({
            id: shot.id,
            title: shot.title,
            contentRevision: shot.contentRevision,
            currentImageAssetVersionId: shot.currentImageAssetVersionId,
          })),
        }, {
          deferFinalization: true,
        });
        const generated = await creatorApp.generateImagesForTasks(
          platform.tasks.map((task) => ({
            shotId: task.shotId,
            taskId: task.taskId,
            storageObjectKey: task.storageObjectKey,
            sourceAttemptId: task.attemptId,
          })),
        );
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
        });
        const successByTaskId = new Map(
          (generated.successes as Array<{
            shot: ShotRecord;
            asset: Parameters<typeof upsertAssetVersionSnapshot>[1]["asset"];
            version: Parameters<typeof upsertAssetVersionSnapshot>[1]["version"];
          }>).map((success) => [success.version.sourceTaskId, success] as const),
        );
        const shotById = new Map(
          (generated.shots as ShotRecord[]).map((shot) => [shot.id, shot] as const),
        );

        for (const task of platform.tasks) {
          const success = successByTaskId.get(task.taskId);
          const shot = shotById.get(task.shotId);
          if (!shot) {
            throw new Error(`creator_image_shot_missing:${task.shotId}`);
          }

          await finalizeTaskAttempt(deps.db, {
            taskId: task.taskId,
            attemptId: task.attemptId,
            status: success ? "succeeded" : "failed",
            failureCode: success ? null : "generation_failed",
            now: input.now,
            finalize: async () => {
              if (success) {
                await upsertAssetVersionSnapshot(deps.db, {
                  asset: success.asset,
                  version: {
                    ...success.version,
                    storageObjectId: task.storageObjectId,
                  },
                  now: input.now,
                });
              }
              await upsertShotsForProject(deps.db, {
                projectId,
                createdByUserId: actor.userId,
                shots: [shot],
                now: input.now,
              });
              await updateProjectPhase(deps.db, projectId, "shot_generation");
            },
          });
        }
        await aggregateWorkflowStatus(deps.db, platform.workflowId);

        return {
          status: 200,
          body: {
            ...generated,
            platform,
            request: input.body ?? {},
            selectionContext:
              input.body?.parameters?.selectionContext &&
              typeof input.body.parameters.selectionContext === "object"
                ? input.body.parameters.selectionContext
                : null,
            fixedImages: createFixedImageGenerationResults(
              input.body?.promptOverride ?? null,
              input.body?.parameters?.selectionContext &&
                typeof input.body.parameters.selectionContext === "object"
                ? input.body.parameters.selectionContext
                : null,
            ),
          },
        };
      }
    },

    async retryShotImage(input: {
      user: AuthenticatedCreatorUser;
      body: { shotId: string };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const projectId = sqlState.projectId;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        projectId,
        shotId: input.body.shotId,
      });
      if (!shot) {
        return {
          status: 404,
          body: { error: "shot_not_found" },
        };
      }
      const retryableImageStatus = shot.imageStatus;
      if (retryableImageStatus !== "failed" && retryableImageStatus !== "stale") {
        return {
          status: 409,
          body: { error: "shot_image_retry_unavailable" },
        };
      }

      const taskId = randomUUID();
      const claimedShot = await claimShotImageRetryForTask(deps.db, {
        projectId,
        shotId: shot.id,
        taskId,
        now: input.now,
      });
      if (!claimedShot) {
        return {
          status: 409,
          body: { error: "shot_image_retry_unavailable" },
        };
      }

      let platform: Awaited<ReturnType<typeof requestCreatorImageGenerationPlatformBatch>>;
      try {
        platform = await requestCreatorImageGenerationPlatformBatch(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
          shots: [claimedShot],
        }, {
          deferFinalization: true,
          taskIdsByShotId: { [claimedShot.id]: taskId },
        });
      } catch (error) {
        await releaseImageRetryClaimIfSafe(deps.db, {
          projectId,
          shotId: shot.id,
          taskId,
          previousStatus: retryableImageStatus,
          now: input.now,
        });
        throw error;
      }
      const task = platform.tasks[0];
      if (!task) {
        await releaseImageRetryClaimIfSafe(deps.db, {
          projectId,
          shotId: shot.id,
          taskId,
          previousStatus: retryableImageStatus,
          now: input.now,
        });
        return {
          status: 409,
          body: { error: "shot_image_retry_unavailable" },
        };
      }

      const generated = await creatorApp.generateImagesForTasks([
        {
          shotId: shot.id,
          taskId: task.taskId,
          storageObjectKey: task.storageObjectKey,
          sourceAttemptId: task.attemptId,
        },
      ]);
      const success = (
        generated.successes as Array<{
          shot: ShotRecord;
          asset: Parameters<typeof upsertAssetVersionSnapshot>[1]["asset"];
          version: Parameters<typeof upsertAssetVersionSnapshot>[1]["version"];
        }>
      ).find((candidate) => candidate.version.sourceTaskId === task.taskId);
      const retriedShot = (generated.shots as ShotRecord[]).find(
        (candidate) => candidate.id === shot.id,
      );
      if (!retriedShot) {
        throw new Error(`creator_image_retry_result_missing:${shot.id}`);
      }

      await finalizeTaskAttempt(deps.db, {
        taskId: task.taskId,
        attemptId: task.attemptId,
        status: success ? "succeeded" : "failed",
        failureCode: success ? null : "generation_failed",
        now: input.now,
        finalize: async () => {
          if (success) {
            await upsertAssetVersionSnapshot(deps.db, {
              asset: success.asset,
              version: {
                ...success.version,
                storageObjectId: task.storageObjectId,
              },
              now: input.now,
            });
          }
          await upsertShotsForProject(deps.db, {
            projectId,
            createdByUserId: actor.userId,
            shots: [retriedShot],
            now: input.now,
          });
          await updateProjectPhase(deps.db, projectId, "shot_generation");
        },
      });
      await aggregateWorkflowStatus(deps.db, platform.workflowId);

      return {
        status: 200,
        body: {
          shot: retriedShot,
          asset: success?.asset,
          version: success?.version,
          platform,
        },
      };
    },

    async generateVideos(input: {
      user: AuthenticatedCreatorUser;
      body?: {
        shotId?: string | null;
        motionPrompt?: string | null;
        model?: string | null;
        parameters?: Record<string, unknown> | null;
        audioEnabled?: boolean | null;
        musicEnabled?: boolean | null;
        lipSyncEnabled?: boolean | null;
      };
      now: Date;
      idempotencyKey?: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const before = await creatorApp.getState();
      const projectId = sqlState.projectId ?? before.project?.id;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const requestedShots = filterRequestedShots(before.shots, input.body?.shotId);
      if (input.idempotencyKey) {
        return runIdempotentCreatorAction(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          capability: capabilities.generationStart,
          operationName: operationNames.shotVideoGenerate,
          idempotencyKey: input.idempotencyKey,
          request: {
            projectId,
            shotIds: requestedShots.map((shot) => shot.id),
            body: input.body ?? {},
          },
          now: input.now,
          execute: async () => generateVideosAction(requestedShots),
        });
      }

      return generateVideosAction(requestedShots);

      async function generateVideosAction(
        selectedShots: CreatorDevStateSnapshot["shots"],
      ) {
        const platform = await requestCreatorVideoGenerationPlatformBatch(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
          options: {
            shotId: input.body?.shotId ?? null,
            motionPrompt: input.body?.motionPrompt ?? null,
            model: input.body?.model ?? null,
            parameters: input.body?.parameters ?? null,
            audioEnabled: input.body?.audioEnabled ?? null,
            musicEnabled: input.body?.musicEnabled ?? null,
            lipSyncEnabled: input.body?.lipSyncEnabled ?? null,
          },
          shots: selectedShots.map((shot) => ({
            id: shot.id,
            title: shot.title,
            contentRevision: shot.contentRevision,
            currentImageAssetVersionId: shot.currentImageAssetVersionId,
          })),
        }, {
          deferFinalization: true,
        });
        const generated = await creatorApp.generateVideosForTasks(
          platform.tasks.map((task) => ({
            shotId: task.shotId,
            taskId: task.taskId,
            storageObjectKey: task.storageObjectKey,
            sourceAttemptId: task.attemptId,
          })),
        );
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
        });
        const resultByTaskId = new Map(
          (generated.results as Array<{
            shot: ShotRecord;
            asset?: Parameters<typeof upsertAssetVersionSnapshot>[1]["asset"];
            version?: Parameters<typeof upsertAssetVersionSnapshot>[1]["version"];
          }>).map((result) => [
            result.version?.sourceTaskId ?? `failed:${result.shot.activeVideoTaskId}`,
            result,
          ] as const),
        );
        const shotById = new Map(
          (generated.shots as ShotRecord[]).map((shot) => [shot.id, shot] as const),
        );

        for (const task of platform.tasks) {
          const result =
            resultByTaskId.get(task.taskId) ??
            resultByTaskId.get(`failed:${task.taskId}`);
          const shot = shotById.get(task.shotId);
          if (!result || !shot) {
            throw new Error(`creator_video_result_missing:${task.taskId}`);
          }

          await finalizeTaskAttempt(deps.db, {
            taskId: task.taskId,
            attemptId: task.attemptId,
            status: result.asset && result.version ? "succeeded" : "failed",
            failureCode: result.asset && result.version ? null : "generation_failed",
            now: input.now,
            finalize: async () => {
              if (result.asset && result.version) {
                await upsertAssetVersionSnapshot(deps.db, {
                  asset: result.asset,
                  version: {
                    ...result.version,
                    storageObjectId: task.storageObjectId,
                  },
                  now: input.now,
                });
              }
              await upsertShotsForProject(deps.db, {
                projectId,
                createdByUserId: actor.userId,
                shots: [shot],
                now: input.now,
              });
              await updateProjectPhase(deps.db, projectId, "shot_generation");
            },
          });
        }
        await aggregateWorkflowStatus(deps.db, platform.workflowId);

        return {
          status: 200,
          body: {
            ...generated,
            platform,
            request: input.body ?? {},
          },
        };
      }
    },

    async retryShotVideo(input: {
      user: AuthenticatedCreatorUser;
      body: { shotId: string };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const projectId = sqlState.projectId;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        projectId,
        shotId: input.body.shotId,
      });
      if (!shot) {
        return {
          status: 404,
          body: { error: "shot_not_found" },
        };
      }
      if (!shot.currentImageAssetVersionId) {
        return {
          status: 409,
          body: { error: "current_image_required" },
        };
      }
      const retryableVideoStatus = shot.videoStatus;
      if (retryableVideoStatus !== "failed" && retryableVideoStatus !== "stale") {
        return {
          status: 409,
          body: { error: "shot_video_retry_unavailable" },
        };
      }

      const taskId = randomUUID();
      const claimedShot = await claimShotVideoRetryForTask(deps.db, {
        projectId,
        shotId: shot.id,
        taskId,
        now: input.now,
      });
      if (!claimedShot) {
        return {
          status: 409,
          body: { error: "shot_video_retry_unavailable" },
        };
      }

      let platform: Awaited<ReturnType<typeof requestCreatorVideoGenerationPlatformBatch>>;
      try {
        platform = await requestCreatorVideoGenerationPlatformBatch(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
          shots: [claimedShot],
        }, {
          deferFinalization: true,
          taskIdsByShotId: { [claimedShot.id]: taskId },
        });
      } catch (error) {
        await releaseVideoRetryClaimIfSafe(deps.db, {
          projectId,
          shotId: shot.id,
          taskId,
          previousStatus: retryableVideoStatus,
          now: input.now,
        });
        throw error;
      }
      const task = platform.tasks[0];
      if (!task) {
        await releaseVideoRetryClaimIfSafe(deps.db, {
          projectId,
          shotId: shot.id,
          taskId,
          previousStatus: retryableVideoStatus,
          now: input.now,
        });
        return {
          status: 409,
          body: { error: "shot_video_retry_unavailable" },
        };
      }

      const generated = await creatorApp.generateVideosForTasks([
        {
          shotId: shot.id,
          taskId: task.taskId,
          storageObjectKey: task.storageObjectKey,
          sourceAttemptId: task.attemptId,
        },
      ]);
      const result = (
        generated.results as Array<{
          status: "completed" | "failed" | "stale";
          shot: ShotRecord;
          asset?: Parameters<typeof upsertAssetVersionSnapshot>[1]["asset"];
          version?: Parameters<typeof upsertAssetVersionSnapshot>[1]["version"];
        }>
      ).find(
        (candidate) =>
          candidate.version?.sourceTaskId === task.taskId ||
          candidate.shot.activeVideoTaskId === task.taskId,
      );
      const retriedShot = (generated.shots as ShotRecord[]).find(
        (candidate) => candidate.id === shot.id,
      );
      if (!result || !retriedShot) {
        throw new Error(`creator_video_retry_result_missing:${task.taskId}`);
      }

      await finalizeTaskAttempt(deps.db, {
        taskId: task.taskId,
        attemptId: task.attemptId,
        status: result.asset && result.version ? "succeeded" : "failed",
        failureCode: result.asset && result.version ? null : "generation_failed",
        now: input.now,
        finalize: async () => {
          if (result.asset && result.version) {
            await upsertAssetVersionSnapshot(deps.db, {
              asset: result.asset,
              version: {
                ...result.version,
                storageObjectId: task.storageObjectId,
              },
              now: input.now,
            });
          }
          await upsertShotsForProject(deps.db, {
            projectId,
            createdByUserId: actor.userId,
            shots: [retriedShot],
            now: input.now,
          });
          await updateProjectPhase(deps.db, projectId, "shot_generation");
        },
      });
      await aggregateWorkflowStatus(deps.db, platform.workflowId);

      return {
        status: 200,
        body: {
          shot: retriedShot,
          asset: result.asset,
          version: result.version
            ? {
                ...result.version,
                storageObjectId: task.storageObjectId,
              }
            : result.version,
          platform,
        },
      };
    },

    async previewExport(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
      idempotencyKey?: string;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }
      if (input.idempotencyKey) {
        return runIdempotentCreatorAction(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          capability: capabilities.exportCreate,
          operationName: operationNames.exportCreate,
          idempotencyKey: input.idempotencyKey,
          request: { projectId },
          now: input.now,
          execute: async () => previewExportAction(),
        });
      }

      return previewExportAction();

      async function previewExportAction() {
        const exportPreview = await creatorApp.previewExport();
        const platform = await createCreatorExportArtifact(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
          manifest: exportPreview.export,
        }, {
          deferFinalization: true,
        });
        const actor = await resolveUserActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId,
          now: input.now,
        });
        await finalizeTaskAttempt(deps.db, {
          taskId: platform.taskId,
          attemptId: platform.attemptId,
          status: "succeeded",
          now: input.now,
          finalize: async () => {
            await createExportRecord(deps.db, {
              projectId,
              workflowId: platform.workflowId,
              storageObjectId: platform.storageObjectId,
              manifestStatus: exportPreview.export.status,
              allowPartialExport: exportPreview.export.allowPartialExport,
              itemCount: exportPreview.export.items.length,
              missingAssetCount: exportPreview.export.missingAssets.length,
              latestSignedUrlExpiresAt: platform.expiresAt,
              createdByUserId: actor.userId,
              now: input.now,
            });
            await updateProjectPhase(deps.db, projectId, "export");
          },
        });
        await aggregateWorkflowStatus(deps.db, platform.workflowId);
        const exportRecord = (
          await listExportRecordsForProject(deps.db, {
            projectId,
            limit: 1,
          })
        )[0];

        return {
          status: 200,
          body: {
            ...exportPreview,
            exportRecord,
            platform,
          },
        };
      }
    },

    async listExportHistory(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      await hydrateActiveCreatorApp({
        user: input.user,
        creatorApp,
        sqlState,
        now: input.now,
      });
      const state = await creatorApp.getState();
      const projectId = sqlState.projectId ?? state.project?.id;
      if (!projectId) {
        return {
          status: 409,
          body: { error: "creator_project_missing" },
        };
      }

      const actor = await resolveUserActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const records = await listExportRecordsForProject(deps.db, {
        projectId,
      });
      const signedRecords = deps.storageRuntime
        ? await Promise.all(
            records.map((record) =>
              buildSignedExportRecord(deps.db, {
                record,
                sessionToken: input.user.sessionToken,
                runtime: deps.storageRuntime!,
                now: input.now,
                signedUrlExpiresInSeconds,
              }),
            ),
          )
        : records;

      return {
        status: 200,
        body: {
          records: signedRecords,
        },
      };
    },
  };
}

interface ProjectMemberCompatibilityRecord {
  id: string;
  phone: string;
  role: "producer" | "creator" | "viewer";
  note: string;
  status: "enabled" | "disabled";
}

async function listProjectMemberCompatibilityRecords(
  db: SqlDatabase,
  input: { userId: string; projectId: string },
): Promise<ProjectMemberCompatibilityRecord[]> {
  const result = await db.query<{
    id: string;
    member_account: string;
    role: "producer" | "creator" | "viewer";
    note: string | null;
    status: "active" | "disabled";
  }>(`
    SELECT member.id, member.member_account, assignment.role, assignment.note, member.status
    FROM team_member_projects assignment
    JOIN team_members member
      ON member.id = assignment.member_id
     AND member.user_id = assignment.user_id
    WHERE assignment.user_id = $1
      AND assignment.project_id = $2
      AND member.deleted_at IS NULL
      AND member.status <> 'deleted'
    ORDER BY member.created_at ASC, member.id ASC
  `, [input.userId, input.projectId]);
  return result.rows.map(projectMemberCompatibilityRecordFromRow);
}

async function findProjectMemberCompatibilityRecord(
  db: SqlDatabase,
  input: { userId: string; projectId: string; memberId: string },
) {
  const members = await listProjectMemberCompatibilityRecords(db, input);
  return members.find((member) => member.id === input.memberId) ?? null;
}

async function upsertProjectMemberCompatibilityAssignment(
  db: SqlDatabase,
  input: {
    userId: string;
    memberId: string;
    projectId: string;
    role: "producer" | "creator" | "viewer";
    note: string;
    now: Date;
  },
) {
  await db.query(`
    INSERT INTO team_member_projects (id, member_id, user_id, project_id, role, note, created_at)
    VALUES ($1, $2, $3, $4, $5, NULLIF($6, ''), $7)
    ON CONFLICT (member_id, project_id)
    DO UPDATE SET role = EXCLUDED.role, note = EXCLUDED.note
  `, [randomUUID(), input.memberId, input.userId, input.projectId, input.role, input.note, input.now]);
}

function projectMemberCompatibilityRecordFromRow(row: {
  id: string;
  member_account: string;
  role: "producer" | "creator" | "viewer";
  note: string | null;
  status: "active" | "disabled";
}): ProjectMemberCompatibilityRecord {
  return {
    id: row.id,
    phone: `+86${row.member_account}`,
    role: row.role,
    note: row.note ?? "",
    status: row.status === "active" ? "enabled" : "disabled",
  };
}

function teamServiceErrorResponse(
  error: unknown,
): CreatorHttpResponse<Record<string, unknown>> {
  if (!(error instanceof TeamServiceError)) {
    throw error;
  }

  const conflictErrors = new Set([
    "team_account_duplicate",
    "team_seat_limit_reached",
    "team_credit_insufficient",
    "team_member_credit_insufficient",
  ]);
  const status =
    error.code === "team_member_input_invalid"
      ? 400
      : error.code === "team_member_management_required"
        ? 402
        : conflictErrors.has(error.code)
          ? 409
          : 403;

  return {
    status,
    body: { error: error.code },
  };
}

function isTeamPermissionMissing(error: unknown) {
  return error instanceof TeamServiceError && error.code === "team_permission_missing";
}

async function getLimitedTeamOverview(
  db: SqlDatabase,
  input: { sessionToken: string; now: Date },
) {
  const actor = await resolveUserActorContext(db, {
    sessionToken: input.sessionToken,
    now: input.now,
  });
  const [planLimits, usedSeats, credits] = await Promise.all([
    resolveLimitedTeamPlanLimits(db, { userId: actor.userId }),
    countLimitedTeamSubaccounts(db, {
      userId: actor.userId,
    }),
    queryOne<{
      credit_balance_cached: number;
      credit_reserved_cached: number;
    }>(
      db,
      `
        SELECT credit_balance_cached, credit_reserved_cached
        FROM users
        WHERE id = $1
      `,
      [actor.userId],
    ),
  ]);

  return {
    entitlements: {
      teamMemberManagement: planLimits.seatLimit > 0,
      teamAssetLibrary: planLimits.seatLimit > 0,
      teamDashboard: false,
    },
    seats: {
      used: usedSeats,
      limit: planLimits.seatLimit,
      remaining: Math.max(0, planLimits.seatLimit - usedSeats),
    },
    team: {
      activated: usedSeats > 0,
      memberCount: usedSeats,
    },
    concurrency: {
      singleAccountLimit: planLimits.singleAccountConcurrencyLimit,
    },
    credits: {
      allocatable: Math.max(
        0,
        (credits?.credit_balance_cached ?? 0) -
          (credits?.credit_reserved_cached ?? 0),
      ),
    },
    permissions: {
      canReadMembers: false,
      canCreateMember: false,
      canViewDashboard: false,
      canManageAll: false,
      canManageGroup: false,
    },
    teamAccountSuffix: await ensureUserTeamAccountSuffix(db, actor.userId),
  };
}

async function resolveLimitedTeamPlanLimits(
  db: SqlDatabase,
  input: { userId: string },
) {
  const limits = await queryOne<{ team_seat_limit: number }>(
    db,
    `
      SELECT team_seat_limit
      FROM users
      WHERE id = $1
      LIMIT 1
    `,
    [input.userId],
  );
  const seatLimit = Number(limits?.team_seat_limit ?? 0);

  return {
    seatLimit,
    singleAccountConcurrencyLimit: 1,
  };
}

async function countLimitedTeamSubaccounts(
  db: SqlDatabase,
  input: { userId: string },
) {
  const result = await queryOne<{ count: string | number }>(
    db,
    `
      SELECT COUNT(*) AS count
      FROM team_members
      WHERE user_id = $1
        AND status = 'active'
    `,
    [input.userId],
  );

  return Number(result?.count ?? 0);
}

async function releaseImageRetryClaimIfSafe(
  db: SqlDatabase,
  input: {
    projectId: string;
    shotId: string;
    taskId: string;
    previousStatus: Extract<ShotRecord["imageStatus"], "failed" | "stale">;
    now: Date;
  },
) {
  const externalStarted = await hasExternalProviderSubmissionStartedForTask(db, {
    taskId: input.taskId,
  });
  if (externalStarted) {
    return;
  }

  await releaseShotImageRetryClaim(db, input);
}

async function releaseVideoRetryClaimIfSafe(
  db: SqlDatabase,
  input: {
    projectId: string;
    shotId: string;
    taskId: string;
    previousStatus: Extract<ShotRecord["videoStatus"], "failed" | "stale">;
    now: Date;
  },
) {
  const externalStarted = await hasExternalProviderSubmissionStartedForTask(db, {
    taskId: input.taskId,
  });
  if (externalStarted) {
    return;
  }

  await releaseShotVideoRetryClaim(db, input);
}

async function runIdempotentCreatorAction(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    projectId: string;
    capability: Capability;
    operationName: OperationName;
    idempotencyKey: string;
    request: Record<string, unknown>;
    now: Date;
    execute: () => Promise<CreatorHttpResponse<Record<string, unknown>>>;
  },
): Promise<CreatorHttpResponse<Record<string, unknown>>> {
  let transactionOpen = false;
  let startedRecord:
    | Awaited<ReturnType<typeof beginOrReplayCommand>>["record"]
    | null = null;

  try {
    await db.query("BEGIN");
    transactionOpen = true;

    const actor = await resolveUserActorContext(db, {
      sessionToken: input.sessionToken,
      projectId: input.projectId,
      capability: input.capability,
      now: input.now,
    });
    const store = new SqlIdempotencyRecordStore(db);
    const started = await beginOrReplayCommand(store, {
      scopeKey: `user:${actor.userId}`,
      userId: actor.userId,
      operationName: input.operationName,
      idempotencyKey: input.idempotencyKey,
      requestHash: hashJson(input.request),
    });

    if (started.kind === "replayed") {
      await db.query("COMMIT");
      transactionOpen = false;
      return {
        status: responseStatusFromSnapshot(started.record.responseSnapshot),
        body: responseBodyFromSnapshot(started.record.responseSnapshot),
      };
    }

    if (started.kind === "processing") {
      throw new IdempotencyProcessingError(started.record);
    }

    startedRecord = started.record;
    await db.query("COMMIT");
    transactionOpen = false;
  } catch (error) {
    if (transactionOpen) {
      await db.query("ROLLBACK");
    }

    if (error instanceof IdempotencyConflictError) {
      return {
        status: 409,
        body: { error: error.code },
      };
    }

    if (error instanceof IdempotencyProcessingError) {
      return {
        status: 202,
        body: { error: error.code },
      };
    }

    throw error;
  }

  if (!startedRecord) {
    throw new Error("idempotency_started_record_missing");
  }

  const response = await input.execute();
  const store = new SqlIdempotencyRecordStore(db);

  try {
    await db.query("BEGIN");
    transactionOpen = true;
    await store.update({
      ...startedRecord,
      responseResourceType: responseResourceTypeForResponse(
        input.operationName,
        response,
      ),
      responseResourceId: responseResourceIdForResponse(
        input.operationName,
        response,
      ),
      responseSnapshot: responseSnapshotForResponse(response),
      status: idempotencyStatusForResponse(response),
      updatedAt: input.now,
    });

    await db.query("COMMIT");
    transactionOpen = false;
    return response;
  } catch (error) {
    if (transactionOpen) {
      await db.query("ROLLBACK");
    }

    throw error;
  }
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalizeJson(value)))
    .digest("hex");
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJson(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeJson(item)]),
    );
  }

  return value;
}

const idempotencyHttpStatusSnapshotKey = "__creatorHttpStatus";

function idempotencyStatusForResponse(
  response: CreatorHttpResponse<Record<string, unknown>>,
) {
  return response.status >= 200 && response.status < 300 ? "succeeded" : "failed_terminal";
}

function responseSnapshotForResponse(
  response: CreatorHttpResponse<Record<string, unknown>>,
): Record<string, unknown> {
  if (response.status >= 200 && response.status < 300) {
    return response.body;
  }

  return {
    ...response.body,
    [idempotencyHttpStatusSnapshotKey]: response.status,
  };
}

function responseResourceTypeForResponse(
  operationName: OperationName,
  response: CreatorHttpResponse<Record<string, unknown>>,
) {
  if (response.status < 200 || response.status >= 300) {
    return undefined;
  }

  if (
    operationName === operationNames.shotImageGenerate ||
    operationName === operationNames.shotVideoGenerate
  ) {
    return "workflow";
  }

  if (operationName === operationNames.exportCreate) {
    return "export_record";
  }

  return "calibration_session";
}

function responseStatusFromSnapshot(snapshot?: Record<string, unknown>) {
  if (snapshot) {
    const parsed = snapshot[idempotencyHttpStatusSnapshotKey];
    if (typeof parsed === "number" && Number.isInteger(parsed) && parsed >= 100 && parsed <= 599) {
      return parsed;
    }
    if (typeof parsed === "string") {
      const parsedNumber = Number(parsed);
      if (Number.isInteger(parsedNumber) && parsedNumber >= 100 && parsedNumber <= 599) {
        return parsedNumber;
      }
    }
  }

  return 200;
}

function responseBodyFromSnapshot(
  snapshot?: Record<string, unknown>,
): Record<string, unknown> {
  if (!snapshot) {
    return {};
  }

  if (Object.hasOwn(snapshot, idempotencyHttpStatusSnapshotKey)) {
    const { [idempotencyHttpStatusSnapshotKey]: _status, ...body } = snapshot;
    return body;
  }

  return snapshot;
}

function responseResourceIdForResponse(
  operationName: OperationName,
  response: CreatorHttpResponse<Record<string, unknown>>,
) {
  if (response.status < 200 || response.status >= 300) {
    return undefined;
  }

  return responseResourceIdFromBody(operationName, response.body);
}

function responseResourceIdFromBody(
  operationName: OperationName,
  body: Record<string, unknown>,
) {
  if (
    operationName === operationNames.shotImageGenerate ||
    operationName === operationNames.shotVideoGenerate
  ) {
    const platform = body.platform as { workflowId?: string } | undefined;
    if (!platform?.workflowId) {
      throw new Error("idempotency_response_resource_missing:workflow");
    }
    return platform.workflowId;
  }

  if (operationName === operationNames.exportCreate) {
    const exportRecord = body.exportRecord as { id?: string } | undefined;
    if (!exportRecord?.id) {
      throw new Error("idempotency_response_resource_missing:export_record");
    }
    return exportRecord.id;
  }

  const calibration = body.calibration as { id?: string } | undefined;
  if (!calibration?.id) {
    throw new Error("idempotency_response_resource_missing:calibration_session");
  }
  return calibration.id;
}

async function appendCalibrationAuditEvent(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    projectId: string;
    calibrationId: string;
    decisionType: "passed" | "skipped" | "override";
    reason: string | null;
    shotIds: string[];
    now: Date;
  },
): Promise<AuditEventRecord> {
  const actor = await resolveUserActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    now: input.now,
  });

  return appendAuditEvent(db, {
    projectId: input.projectId,
    actorUserId: actor.userId,
    eventType: calibrationDecisionEventType(input.decisionType),
    targetType: "calibration_session",
    targetId: input.calibrationId,
    reason: input.reason,
    sensitive: input.decisionType === "skipped",
    metadata: {
      calibrationSessionId: input.calibrationId,
      decisionType: input.decisionType,
      shotIds: input.shotIds,
    },
    occurredAt: input.now,
  });
}

async function listProjectsForUser(
  db: SqlDatabase,
  input: { ownerUserId: string; page: number; pageSize: number; keyword: string; visibleProjectIds?: string[] | null },
) {
  const params: unknown[] = [input.ownerUserId];
  const whereClauses = [
    "created_by_user_id = $1",
    `NOT EXISTS (
          SELECT 1
          FROM creator_canvas_projects ccp
          WHERE ccp.project_id = projects.id
            AND ccp.deleted_at IS NULL
        )`,
    `NOT EXISTS (
          SELECT 1
          FROM scripts s
          WHERE s.project_id = projects.id
            AND s.title IS NOT NULL
            AND s.deleted_at IS NULL
        )`,
  ];
  if (input.keyword) {
    params.push(input.keyword);
    whereClauses.push(`POSITION($${params.length} IN LOWER(projects.name)) > 0`);
  }
  if (Array.isArray(input.visibleProjectIds)) {
    if (!input.visibleProjectIds.length) {
      return {
        projects: [],
        page: 1,
        pageSize: input.pageSize,
        total: 0,
      };
    }
    params.push(input.visibleProjectIds);
    whereClauses.push(`projects.id = ANY($${params.length}::uuid[])`);
  }
  const whereSql = whereClauses.join("\n        AND ");
  const totalRow = await queryOne<{ total: number | string }>(
    db,
    `
      SELECT COUNT(*) AS total
      FROM projects
      WHERE ${whereSql}
    `,
    params,
  );
  const total = Math.max(0, Number(totalRow?.total ?? 0));
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / input.pageSize)));
  const offset = (page - 1) * input.pageSize;
  const pageParams = [...params, input.pageSize, offset];
  const result = await db.query<{
    id: string;
    name: string;
    cover_image_url: string | null;
    cover_storage_object_id: string | null;
    aspect_ratio: string;
    resolution: string;
    phase: string;
    created_by_user_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT
        id,
        name,
        cover_image_url,
        cover_storage_object_id,
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id,
        created_at,
        updated_at
      FROM projects
      WHERE ${whereSql}
      ORDER BY created_at DESC, id DESC
      LIMIT $${pageParams.length - 1}
      OFFSET $${pageParams.length}
    `,
    pageParams,
  );

  return {
    projects: result.rows.map((project) => ({
      id: project.id,
      name: project.name,
      coverImageUrl: project.cover_image_url,
      coverStorageObjectId: project.cover_storage_object_id,
      aspectRatio: project.aspect_ratio,
      resolution: project.resolution,
      phase: project.phase,
      createdByUserId: project.created_by_user_id,
      createdAt: new Date(project.created_at),
      updatedAt: new Date(project.updated_at),
    })),
    page,
    pageSize: input.pageSize,
    total,
  };
}

async function isProjectVisibleToActor(
  db: SqlDatabase,
  input: { actor: UserActorContext; projectId: string; projectOwnerUserId: string | null },
) {
  if (!input.actor.teamMember) {
    return input.projectOwnerUserId === input.actor.userId;
  }

  const assignment = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM team_member_projects
      WHERE user_id = $1
        AND member_id = $2
        AND project_id = $3
      LIMIT 1
    `,
    [input.actor.userId, input.actor.teamMember.id, input.projectId],
  );
  return Boolean(assignment);
}

function normalizeCreatorProjectPage(value: unknown) {
  const page = Math.floor(Number(value ?? 1));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function normalizeCreatorProjectPageSize(value: unknown) {
  const pageSize = Math.floor(Number(value ?? DEFAULT_CREATOR_PROJECT_PAGE_SIZE));
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return DEFAULT_CREATOR_PROJECT_PAGE_SIZE;
  }
  return Math.min(MAX_CREATOR_PROJECT_PAGE_SIZE, pageSize);
}

function normalizeCreatorProjectKeyword(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase()
    .slice(0, 100);
}

function normalizeUserScriptPage(value: unknown) {
  const page = Math.floor(Number(value ?? 1));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function normalizeUserScriptPageSize(value: unknown) {
  const pageSize = Math.floor(Number(value ?? 10));
  if (!Number.isFinite(pageSize) || pageSize <= 0) {
    return 10;
  }
  return Math.min(100, pageSize);
}

async function updateProjectRecord(
  db: SqlDatabase,
  input: {
    projectId: string;
    name?: string | null;
    phase?: "script_input" | "asset_review" | "shot_generation" | "export" | null;
    coverImageUrl?: string | null;
    coverStorageObjectId?: string | null;
    now: Date;
  },
) {
  const current = (
    await db.query<{
      id: string;
      name: string;
      cover_image_url: string | null;
      cover_storage_object_id: string | null;
      aspect_ratio: string;
      resolution: string;
      phase: "script_input" | "asset_review" | "shot_generation" | "export";
      created_by_user_id: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      `
        SELECT *
        FROM projects
        WHERE id = $1
      `,
      [input.projectId],
    )
  ).rows[0];
  if (!current) {
    return null;
  }

  const name = input.name === undefined ? current.name : input.name?.trim();
  if (!name) {
    throw new Error("project_name_required");
  }
  const row = (
    await db.query<typeof current>(
      `
        UPDATE projects
        SET name = $2,
            phase = $3,
            cover_image_url = $4,
            cover_storage_object_id = $5,
            updated_at = $6
        WHERE id = $1
        RETURNING *
      `,
      [
        input.projectId,
        name,
        input.phase ?? current.phase,
        input.coverImageUrl === undefined ? current.cover_image_url : input.coverImageUrl,
        input.coverStorageObjectId === undefined
          ? current.cover_storage_object_id
          : input.coverStorageObjectId,
        input.now,
      ],
    )
  ).rows[0]!;

  return {
    id: row.id,
    name: row.name,
    coverImageUrl: row.cover_image_url,
    coverStorageObjectId: row.cover_storage_object_id,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    phase: row.phase,
    createdByUserId: row.created_by_user_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

async function findProjectAssetById(
  db: SqlDatabase,
  input: { assetId: string },
) {
  const result = await db.query<{
    id: string;
    project_id: string;
    asset_type: string;
    asset_key: string;
  }>(
    `
      SELECT id, project_id, asset_type, asset_key
      FROM assets
      WHERE id = $1
      LIMIT 1
    `,
    [input.assetId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    projectId: row.project_id,
    assetType: row.asset_type,
    assetKey: row.asset_key,
  };
}

async function updateProjectAssetRecord(
  db: SqlDatabase,
  input: {
    assetId: string;
    name?: string | null;
    description?: string | null;
    isMain?: boolean | null;
    previewUrl?: string | null;
    sourceUrl?: string | null;
    downloadUrl?: string | null;
    storageObjectId?: string | null;
    storageObjectKey?: string | null;
    mimeType?: string | null;
    generationTaskId?: string | null;
    generationStatus?: string | null;
    generationResult?: Record<string, unknown> | null;
    now: Date;
  },
) {
  const latestVersion = (
    await db.query<{
      id: string;
      metadata_json: Record<string, unknown> | null;
      storage_object_id: string | null;
      storage_object_key: string | null;
    }>(
      `
        SELECT id, metadata_json, storage_object_id, storage_object_key
        FROM asset_versions
        WHERE asset_id = $1
        ORDER BY version_number DESC
        LIMIT 1
      `,
      [input.assetId],
    )
  ).rows[0];
  if (!latestVersion) {
    return null;
  }

  const metadata = { ...(latestVersion.metadata_json ?? {}) } as Record<string, unknown>;
  if (input.name !== undefined) {
    const nextName = input.name?.trim();
    if (!nextName) {
      throw new Error("asset_name_required");
    }
    metadata.label = nextName;
  }
  if (input.description !== undefined) {
    metadata.description = input.description?.trim() || null;
  }
  if (input.isMain !== undefined && input.isMain !== null) {
    metadata.isMain = Boolean(input.isMain);
  }
  if (input.previewUrl !== undefined || input.sourceUrl !== undefined || input.downloadUrl !== undefined) {
    const previewUrl = String(input.previewUrl ?? "").trim();
    const sourceUrl = String(input.sourceUrl ?? previewUrl).trim() || previewUrl;
    const downloadUrl = String(input.downloadUrl ?? sourceUrl).trim() || sourceUrl;
    if (previewUrl) {
      metadata.previewUrl = previewUrl;
      metadata.fixedImageUrl = previewUrl;
    }
    if (sourceUrl) {
      metadata.sourceUrl = sourceUrl;
    }
    if (downloadUrl) {
      metadata.downloadUrl = downloadUrl;
    }
    if (input.mimeType) {
      metadata.mimeType = input.mimeType;
    }
  }
  if (input.storageObjectId !== undefined) {
    metadata.fixedImageStorageObjectId = input.storageObjectId ?? null;
  }
  if (input.storageObjectKey !== undefined) {
    metadata.storageObjectKey = input.storageObjectKey ?? null;
  }
  if (input.generationTaskId !== undefined) {
    metadata.generationTaskId = input.generationTaskId?.trim() || null;
  }
  if (input.generationStatus !== undefined) {
    metadata.generationStatus = input.generationStatus?.trim() || null;
  }
  if (input.generationResult !== undefined) {
    metadata.generationResult = input.generationResult ?? null;
  }

  await db.query(
    `
      UPDATE asset_versions
      SET metadata_json = $2,
          storage_object_id = $3,
          storage_object_key = $4
      WHERE id = $1
    `,
    [
      latestVersion.id,
      metadata,
      input.storageObjectId === undefined ? latestVersion.storage_object_id : input.storageObjectId,
      input.storageObjectKey === undefined ? latestVersion.storage_object_key : input.storageObjectKey,
    ],
  );
  await db.query(
    `
      UPDATE assets
      SET updated_at = $2
      WHERE id = $1
    `,
    [input.assetId, input.now],
  );

  return latestVersion.id;
}

async function deleteShotMediaVersionRecord(
  db: SqlDatabase,
  input: {
    projectId: string;
    shotId: string;
    kind: "image" | "video";
    assetVersionId: string;
    now: Date;
  },
) {
  const assetType = input.kind === "video" ? "shot_video" : "shot_image";
  let versionRow = (
    await db.query<{
      asset_id: string;
      version_id: string;
      storage_object_id: string | null;
      storage_object_key: string | null;
    }>(
      `
        SELECT v.asset_id, v.id AS version_id, v.storage_object_id, v.storage_object_key
        FROM asset_versions v
        JOIN assets a
          ON a.id = v.asset_id
        WHERE a.project_id = $1
          AND a.asset_key = $2
          AND a.asset_type = $3
          AND v.id = $4
        LIMIT 1
      `,
      [input.projectId, input.shotId, assetType, input.assetVersionId],
    )
  ).rows[0];
  if (!versionRow) {
    const assetVersionRows = (
      await db.query<{
        asset_id: string;
        version_id: string;
        storage_object_id: string | null;
        storage_object_key: string | null;
      }>(
        `
          SELECT a.id AS asset_id, v.id AS version_id, v.storage_object_id, v.storage_object_key
          FROM assets a
          JOIN asset_versions v
            ON v.asset_id = a.id
          WHERE a.project_id = $1
            AND a.asset_key = $2
            AND a.asset_type = $3
            AND a.id = $4
          ORDER BY v.version_number DESC, v.created_at DESC
          LIMIT 2
        `,
        [
          input.projectId,
          input.shotId,
          assetType,
          input.assetVersionId,
        ],
      )
    ).rows;
    if (assetVersionRows.length === 1) {
      versionRow = assetVersionRows[0];
    }
  }
  if (!versionRow) {
    const currentVersionColumn =
      input.kind === "video" ? "current_video_asset_version_id" : "current_image_asset_version_id";
    versionRow = (
      await db.query<{
        asset_id: string;
        version_id: string;
        storage_object_id: string | null;
        storage_object_key: string | null;
      }>(
        `
          SELECT a.id AS asset_id, v.id AS version_id, v.storage_object_id, v.storage_object_key
          FROM shots s
          JOIN asset_versions v
            ON v.id = s.${currentVersionColumn}
          JOIN assets a
            ON a.id = v.asset_id
          WHERE s.project_id = $1
            AND s.id = $2
            AND a.project_id = $1
            AND a.asset_type = $3
            AND (
              v.id = $4
              OR a.id = $4
              OR s.${currentVersionColumn} = $4
            )
          LIMIT 1
        `,
        [input.projectId, input.shotId, assetType, input.assetVersionId],
      )
    ).rows[0];
  }
  if (!versionRow) {
    const candidateRows = (
      await db.query<{
        asset_id: string;
        version_id: string;
        storage_object_id: string | null;
        storage_object_key: string | null;
      }>(
        `
          SELECT a.id AS asset_id, v.id AS version_id, v.storage_object_id, v.storage_object_key
          FROM assets a
          JOIN asset_versions v
            ON v.asset_id = a.id
          WHERE a.project_id = $1
            AND a.asset_key = $2
            AND a.asset_type = $3
          ORDER BY v.version_number DESC, v.created_at DESC
          LIMIT 2
        `,
        [input.projectId, input.shotId, assetType],
      )
    ).rows;
    if (candidateRows.length === 1) {
      versionRow = candidateRows[0];
    }
  }
  if (!versionRow) {
    return false;
  }

  const resolvedVersionId = versionRow.version_id;

  const remainingVersions = (
    await db.query<{ id: string }>(
      `
        SELECT id
        FROM asset_versions
        WHERE asset_id = $1
          AND id <> $2
        ORDER BY version_number DESC, created_at DESC
      `,
      [versionRow.asset_id, resolvedVersionId],
    )
  ).rows;
  const nextVersionId = remainingVersions[0]?.id ?? null;

  if (input.kind === "video") {
    await db.query(
      `
        UPDATE shots
        SET current_video_asset_version_id =
              CASE
                WHEN current_video_asset_version_id = $3 THEN $4
                ELSE current_video_asset_version_id
              END,
            video_status =
              CASE
                WHEN current_video_asset_version_id = $3 AND $4 IS NULL THEN 'not_ready'
                ELSE video_status
              END,
            updated_at = $5
        WHERE project_id = $1
          AND id = $2
      `,
      [input.projectId, input.shotId, resolvedVersionId, nextVersionId, input.now],
    );
  } else {
    await db.query(
      `
        UPDATE shots
        SET current_image_asset_version_id =
              CASE
                WHEN current_image_asset_version_id = $3 THEN $4
                ELSE current_image_asset_version_id
              END,
            image_status =
              CASE
                WHEN current_image_asset_version_id = $3 AND $4 IS NULL THEN 'ready'
                ELSE image_status
              END,
            updated_at = $5
        WHERE project_id = $1
          AND id = $2
      `,
      [input.projectId, input.shotId, resolvedVersionId, nextVersionId, input.now],
    );
  }

  await db.query(
    `
      DELETE FROM asset_versions
      WHERE id = $1
    `,
    [resolvedVersionId],
  );

  if (!remainingVersions.length) {
    await db.query(
      `
        DELETE FROM assets
        WHERE id = $1
      `,
      [versionRow.asset_id],
    );
  }

  let orphanStorageObjectId = versionRow.storage_object_id;
  if (!orphanStorageObjectId && versionRow.storage_object_key) {
    orphanStorageObjectId = (
      await db.query<{ id: string }>(
        `
          SELECT id
          FROM storage_objects
          WHERE object_key = $1
          ORDER BY created_at DESC
          LIMIT 1
        `,
        [versionRow.storage_object_key],
      )
    ).rows[0]?.id ?? null;
  }

  const referencedStorageObject = orphanStorageObjectId
    ? (
        await db.query<{ count: number | string }>(
          `
            SELECT COUNT(*) AS count
            FROM asset_versions
            WHERE storage_object_id = $1
          `,
          [orphanStorageObjectId],
        )
      ).rows[0]
    : null;

  return {
    deleted: true,
    orphanStorageObjectId:
      orphanStorageObjectId &&
      Number(referencedStorageObject?.count ?? 0) === 0
        ? orphanStorageObjectId
        : null,
  };
}

async function deleteProjectAssetRecord(
  db: SqlDatabase,
  input: {
    assetId: string;
  },
) {
  const existing = await findProjectAssetById(db, { assetId: input.assetId });
  if (!existing) {
    return false;
  }
  const versionRows = (
    await db.query<{ storage_object_id: string | null }>(
      `
        SELECT storage_object_id
        FROM asset_versions
        WHERE asset_id = $1
      `,
      [input.assetId],
    )
  ).rows;
  await db.query(
    `
      DELETE FROM shot_reference_assets
      WHERE asset_id = $1
    `,
    [input.assetId],
  );
  await db.query(
    `
      DELETE FROM asset_versions
      WHERE asset_id = $1
    `,
    [input.assetId],
  );
  await db.query(
    `
      DELETE FROM assets
      WHERE id = $1
    `,
    [input.assetId],
  );
  const orphanStorageObjectIds = [];
  for (const row of versionRows) {
    if (!row.storage_object_id) {
      continue;
    }
    const remaining = await db.query<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM asset_versions
        WHERE storage_object_id = $1
      `,
      [row.storage_object_id],
    );
    if (Number(remaining.rows[0]?.count ?? 0) === 0) {
      orphanStorageObjectIds.push(row.storage_object_id);
    }
  }
  return { deleted: true, orphanStorageObjectIds };
}

async function buildProjectStats(
  db: SqlDatabase,
  input: {
    projectId: string;
    now: Date;
  },
) {
  const result = await db.query<{
    member_count: number | string;
    episode_count: number | string;
    shot_count: number | string;
    asset_count: number | string;
    export_count: number | string;
    generated_image_count: number | string;
    generated_video_count: number | string;
    last_activity_at: Date | string | null;
  }>(
    `
      SELECT
        (
          SELECT COUNT(*)
          FROM team_member_projects assignment
          WHERE assignment.project_id = p.id
        ) AS member_count,
        (
          SELECT COUNT(*)
          FROM episodes e
          WHERE e.project_id = p.id
        ) AS episode_count,
        (
          SELECT COUNT(*)
          FROM shots s
          WHERE s.project_id = p.id
        ) AS shot_count,
        (
          SELECT COUNT(*)
          FROM assets a
          WHERE a.project_id = p.id
        ) AS asset_count,
        (
          SELECT COUNT(*)
          FROM export_records er
          WHERE er.project_id = p.id
        ) AS export_count,
        (
          SELECT COUNT(*)
          FROM shots s
          WHERE s.project_id = p.id
            AND s.current_image_asset_version_id IS NOT NULL
        ) AS generated_image_count,
        (
          SELECT COUNT(*)
          FROM shots s
          WHERE s.project_id = p.id
            AND s.current_video_asset_version_id IS NOT NULL
        ) AS generated_video_count,
        GREATEST(
          p.updated_at,
          COALESCE(
            (
              SELECT MAX(er.created_at)
              FROM export_records er
              WHERE er.project_id = p.id
            ),
            p.updated_at
          )
        ) AS last_activity_at
      FROM projects p
      WHERE p.id = $1
      LIMIT 1
    `,
    [input.projectId],
  );
  const row = result.rows[0] ?? null;

  const stats = {
    memberCount: Number(row?.member_count ?? 0),
    episodeCount: Number(row?.episode_count ?? 0),
    shotCount: Number(row?.shot_count ?? 0),
    assetCount: Number(row?.asset_count ?? 0),
    exportCount: Number(row?.export_count ?? 0),
    generatedImageCount: Number(row?.generated_image_count ?? 0),
    generatedVideoCount: Number(row?.generated_video_count ?? 0),
    lastActivityAt: row?.last_activity_at ? new Date(row.last_activity_at) : input.now,
  };

  return stats;
}

async function deleteProjectRecord(
  db: SqlDatabase,
  input: { projectId: string; runtime?: UploadSessionRuntime | null; now: Date },
) {
  await releaseProjectCreditReservationLots(db, input);
  const retainedScriptProjectId = await moveImportedProjectScriptsToRetainedProject(db, input);
  const removableStorageObjects = await listDeletableProjectStorageObjects(db, input);
  await deleteProjectStorageObjectsFromRuntime(db, {
    objects: removableStorageObjects,
    runtime: input.runtime ?? null,
    now: input.now,
  });

  await db.query(
    `UPDATE creator_canvas_node_runs
     SET generation_snapshot_id = NULL
     WHERE generation_snapshot_id IN (
       SELECT snapshot.id
       FROM ai_generation_task_snapshots snapshot
       WHERE snapshot.project_id = $1
          OR snapshot.task_id IN (SELECT id FROM tasks WHERE project_id = $1)
          OR snapshot.credit_reservation_id IN (
            SELECT id FROM credit_reservations WHERE project_id = $1
          )
     )`,
    [input.projectId],
  );
  await db.query(
    `DELETE FROM ai_generation_task_snapshots
     WHERE project_id = $1
        OR task_id IN (SELECT id FROM tasks WHERE project_id = $1)
        OR credit_reservation_id IN (
          SELECT id FROM credit_reservations WHERE project_id = $1
        )`,
    [input.projectId],
  );
  await db.query(
    `UPDATE credit_reservation_allocations
     SET settled_ledger_entry_id = NULL
     WHERE reservation_id IN (SELECT id FROM credit_reservations WHERE project_id = $1)
        OR task_id IN (SELECT id FROM tasks WHERE project_id = $1)
        OR attempt_id IN (SELECT id FROM task_attempts WHERE project_id = $1)`,
    [input.projectId],
  );
  await db.query(
    `DELETE FROM credit_ledger_entries
     WHERE reservation_id IN (SELECT id FROM credit_reservations WHERE project_id = $1)
        OR allocation_id IN (
          SELECT allocation.id
          FROM credit_reservation_allocations allocation
          LEFT JOIN credit_reservations reservation ON reservation.id = allocation.reservation_id
          WHERE reservation.project_id = $1
             OR allocation.task_id IN (SELECT id FROM tasks WHERE project_id = $1)
             OR allocation.attempt_id IN (SELECT id FROM task_attempts WHERE project_id = $1)
        )`,
    [input.projectId],
  );
  await db.query(
    `DELETE FROM credit_reservation_allocations
     WHERE reservation_id IN (SELECT id FROM credit_reservations WHERE project_id = $1)
        OR task_id IN (SELECT id FROM tasks WHERE project_id = $1)
        OR attempt_id IN (SELECT id FROM task_attempts WHERE project_id = $1)`,
    [input.projectId],
  );
  await db.query(
    `DELETE FROM credit_reservation_lot_allocations
     WHERE reservation_id IN (SELECT id FROM credit_reservations WHERE project_id = $1)`,
    [input.projectId],
  );
  await db.query("DELETE FROM credit_reservations WHERE project_id = $1", [input.projectId]);
  await db.query("UPDATE projects SET cover_storage_object_id = NULL WHERE id = $1", [input.projectId]);
  await db.query("DELETE FROM provider_requests WHERE project_id = $1", [input.projectId]);
  await db.query(
    `UPDATE tasks
     SET current_attempt_id = NULL
     WHERE project_id = $1
        OR current_attempt_id IN (SELECT id FROM task_attempts WHERE project_id = $1)`,
    [input.projectId],
  );
  await db.query(
    "DELETE FROM task_attempts WHERE task_id IN (SELECT id FROM tasks WHERE project_id = $1)",
    [input.projectId],
  );
  await db.query("DELETE FROM tasks WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM export_records WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM workflows WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM shot_reference_assets WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM project_upload_records WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM storage_upload_sessions WHERE project_id = $1", [input.projectId]);
  await db.query(
    "DELETE FROM asset_versions WHERE asset_id IN (SELECT id FROM assets WHERE project_id = $1)",
    [input.projectId],
  );
  await db.query("DELETE FROM assets WHERE project_id = $1", [input.projectId]);
  await deleteProjectStorageObjectRecords(db, removableStorageObjects);
  await db.query(
    `DELETE FROM calibration_items
     WHERE calibration_session_id IN (SELECT id FROM calibration_sessions WHERE project_id = $1)
        OR shot_id IN (
          SELECT id
          FROM shots
          WHERE project_id = $1
             OR episode_id IN (SELECT id FROM episodes WHERE project_id = $1)
        )`,
    [input.projectId],
  );
  await db.query("DELETE FROM calibration_sessions WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM asset_review_candidates WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM episode_generation_drafts WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM episode_asset_conversation_threads WHERE project_id = $1", [input.projectId]);
  await db.query(
    `DELETE FROM shot_reference_assets
     WHERE shot_id IN (
       SELECT id
       FROM shots
       WHERE episode_id IN (SELECT id FROM episodes WHERE project_id = $1)
     )`,
    [input.projectId],
  );
  await db.query(
    `DELETE FROM shots
     WHERE project_id = $1
        OR episode_id IN (SELECT id FROM episodes WHERE project_id = $1)`,
    [input.projectId],
  );
  await db.query("DELETE FROM episodes WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM script_reader_sections WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM scripts WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM audit_events WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM team_member_projects WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM creator_canvas_projects WHERE project_id = $1", [input.projectId]);
  await db.query("DELETE FROM projects WHERE id = $1", [input.projectId]);
  if (retainedScriptProjectId) {
    await db.query("UPDATE projects SET updated_at = $2 WHERE id = $1", [retainedScriptProjectId, input.now]);
  }
}

async function moveImportedProjectScriptsToRetainedProject(
  db: SqlDatabase,
  input: { projectId: string; now: Date },
) {
  const scripts = await db.query<{
    id: string;
    title: string | null;
    created_by_user_id: string | null;
  }>(
    `SELECT id, title, created_by_user_id
     FROM scripts
     WHERE project_id = $1 AND title IS NOT NULL AND deleted_at IS NULL
     ORDER BY created_at ASC, id ASC`,
    [input.projectId],
  );
  if (!scripts.rows.length) {
    return null;
  }

  const sourceProject = await queryOne<{
    aspect_ratio: string;
    resolution: string;
    owner_user_id: string;
    created_by_user_id: string | null;
  }>(
    db,
    `SELECT aspect_ratio, resolution, owner_user_id, created_by_user_id
     FROM projects WHERE id = $1 LIMIT 1`,
    [input.projectId],
  );
  if (!sourceProject) {
    return null;
  }

  const retainedProjectId = randomUUID();
  const retainedProjectName = scripts.rows[0]?.title?.trim() || `保留剧本 ${input.projectId.slice(0, 8)}`;
  await db.query(
    `INSERT INTO projects (
       id, name, aspect_ratio, resolution, phase, owner_user_id,
       created_by_user_id, created_at, updated_at
     ) VALUES ($1, $2, $3, $4, 'script_input', $5, $6, $7, $7)`,
    [
      retainedProjectId,
      retainedProjectName,
      sourceProject.aspect_ratio,
      sourceProject.resolution,
      sourceProject.owner_user_id,
      sourceProject.created_by_user_id,
      input.now,
    ],
  );
  await db.query(
    `UPDATE scripts SET project_id = $2, updated_at = $3
     WHERE project_id = $1 AND title IS NOT NULL AND deleted_at IS NULL`,
    [input.projectId, retainedProjectId, input.now],
  );
  await db.query(
    `UPDATE script_reader_sections SET project_id = $2, episode_id = NULL, updated_at = $3
     WHERE project_id = $1 AND status <> 'archived'`,
    [input.projectId, retainedProjectId, input.now],
  );
  return retainedProjectId;
}

async function listDeletableProjectStorageObjects(
  db: SqlDatabase,
  input: { projectId: string },
) {
  const result = await db.query<{ id: string; bucket: string; object_key: string }>(
    `SELECT id, bucket, object_key
     FROM storage_objects object
     WHERE object.project_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM library_asset_versions version
         WHERE version.storage_object_key = object.object_key
       )`,
    [input.projectId],
  );
  return result.rows;
}

async function deleteProjectStorageObjectsFromRuntime(
  db: SqlDatabase,
  input: {
    objects: Array<{ id: string; bucket: string; object_key: string }>;
    runtime?: UploadSessionRuntime | null;
    now: Date;
  },
) {
  if (!input.runtime) {
    return;
  }
  for (const object of input.objects) {
    await deleteStorageObjectRecord(db, {
      storageObjectId: object.id,
      adapter: input.runtime.adapter,
      localObjectStore: input.runtime.localObjectStore ?? null,
      now: input.now,
    });
  }
}

async function deleteProjectStorageObjectRecords(
  db: SqlDatabase,
  objects: Array<{ id: string }>,
) {
  if (!objects.length) {
    return;
  }
  await db.query(
    `
      DELETE FROM storage_objects
      WHERE id = ANY($1::uuid[])
    `,
    [objects.map((object) => object.id)],
  );
}

async function releaseProjectCreditReservationLots(
  db: SqlDatabase,
  input: { projectId: string },
) {
  const reserved = await db.query<{ reserved_amount: number | string }>(
    `
      SELECT COALESCE(sum(amount_reserved), 0)::int AS reserved_amount
      FROM credit_reservations
      WHERE project_id = $1
        AND amount_reserved > 0
    `,
    [input.projectId],
  );
  const reservedAmount = Number(reserved.rows[0]?.reserved_amount ?? 0);
  if (reservedAmount <= 0) {
    return;
  }

  await db.query(
    `
      UPDATE users
      SET credit_balance_cached = credit_balance_cached + $2,
          credit_reserved_cached = GREATEST(0, credit_reserved_cached - $2),
          updated_at = now()
      WHERE id = (
        SELECT owner_user_id FROM projects WHERE id = $1
      )
    `,
    [input.projectId, reservedAmount],
  );
}

async function episodeExistsForProject(
  db: SqlDatabase,
  input: {
    projectId: string;
    episodeId: string;
  },
) {
  const result = await db.query<{ id: string }>(
    `
      SELECT id
      FROM episodes
      WHERE project_id = $1
        AND id = $2
      LIMIT 1
    `,
    [input.projectId, input.episodeId],
  );

  return Boolean(result.rows[0]);
}

async function buildProjectDetail(
  db: SqlDatabase,
  input: {
    projectId: string;
    sessionToken: string;
    runtime?: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
    now: Date;
    projectBundle?: ProjectBundle | null;
    shots?: ShotRecord[] | null;
  },
) {
  const projectBundle = input.projectBundle ?? await loadProjectBundleFromSql(db, {
    projectId: input.projectId,
    scriptId: null,
  });
  if (!projectBundle?.project) {
    return {
      project: null,
      script: null,
      assetSummary: createEmptyAssetSummary(),
      assetsByType: createEmptyAssetsByType(),
      episodes: [],
      shots: [],
      exportHistory: [],
    };
  }

  const [
    assets,
    assetVersions,
    references,
    shots,
    episodes,
    exportHistory,
    scripts,
  ] = await Promise.all([
    listAssetsForProject(db, {
      projectId: input.projectId,
    }),
    listCurrentAssetVersionsForProject(db, {
      projectId: input.projectId,
    }),
    listShotReferencesForProject(db, {
      projectId: input.projectId,
    }),
    input.shots
      ? Promise.resolve(input.shots)
      : listShotsForProject(db, {
          projectId: input.projectId,
        }),
    listEpisodesForProject(db, {
      projectId: input.projectId,
    }),
    listExportRecordsForProject(db, {
      projectId: input.projectId,
    }),
    listScriptsForProjectDetail(db, {
      projectId: input.projectId,
    }),
  ]);

  const assetsByType = groupAssetsByUiType(assets);
  const versionsByShotId = groupShotAssetVersionsByShotId(assetVersions);
  const referencesByShotId = groupReferencesByShotId(references);
  const runtime = input.runtime;
  const previewUrlCache = new Map<string, Promise<string | null>>();
  const resolvePreviewUrlOnce = (storageObjectId: string | null, storageObjectKey: string | null, metadata: Record<string, unknown> | null) => {
    const directPreviewUrl = getAssetPreviewUrl(storageObjectKey, metadata) ?? "";
    const cacheKey = `${storageObjectId ?? ""}|${storageObjectKey ?? ""}|${directPreviewUrl}`;
    const cached = previewUrlCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const pending = resolveStorageBackedPreviewUrl(db, {
      sessionToken: input.sessionToken,
      storageObjectId,
      storageObjectKey,
      metadata,
      now: input.now,
      runtime,
      signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
    });
    previewUrlCache.set(cacheKey, pending);
    pending.catch(() => {
      if (previewUrlCache.get(cacheKey) === pending) {
        previewUrlCache.delete(cacheKey);
      }
    });
    return pending;
  };
  const signedAssets = runtime
    ? await Promise.all(
        assets.map(async (asset) => ({
          ...asset,
          previewUrl: await resolvePreviewUrlOnce(
            asset.latestVersion?.storageObjectId ?? null,
            asset.latestVersion?.storageObjectKey ?? null,
            asset.latestVersion?.metadata ?? null,
          ),
          latestVersion: asset.latestVersion
            ? {
                ...asset.latestVersion,
                previewUrl: await resolvePreviewUrlOnce(
                  asset.latestVersion.storageObjectId ?? null,
                  asset.latestVersion.storageObjectKey ?? null,
                  asset.latestVersion.metadata ?? null,
                ),
              }
            : null,
        })),
      )
    : assets;
  const signedAssetVersions = runtime
    ? await Promise.all(
        assetVersions.map(async (version) => ({
          ...version,
          previewUrl: await resolvePreviewUrlOnce(
            version.storageObjectId ?? null,
            version.storageObjectKey,
            version.metadata ?? null,
          ),
        })),
      )
    : assetVersions;
  const signedReferences = runtime
    ? await Promise.all(
        references.map(async (reference) => ({
          ...reference,
          previewUrl: await resolvePreviewUrlOnce(
            reference.storageObjectId ?? null,
            null,
            { previewUrl: reference.previewUrl ?? null },
          ),
        })),
      )
    : references;
  const signedAssetsByType = groupAssetsByUiType(signedAssets);
  const signedReferencesByShotId = groupReferencesByShotId(signedReferences);
  const signedVersionsByShotId = groupShotAssetVersionsByShotId(signedAssetVersions);
  const signedExportHistory = runtime
    ? await Promise.all(
        exportHistory.map((record) =>
          buildSignedExportRecord(db, {
            record,
            sessionToken: input.sessionToken,
            runtime,
            now: input.now,
            signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
          }),
        ),
      )
    : exportHistory;
  const projectEpisodes = episodes.length
    ? episodes
    : shots.length
      ? [
          {
            id: "episode-primary",
            projectId: input.projectId,
            title: "剧一",
            sequence: 1,
            status: "draft" as const,
            createdByUserId: projectBundle.project.createdByUserId,
            createdAt: projectBundle.project.createdAt,
            updatedAt: input.now,
          },
        ]
      : [];
  const signedProject = runtime
    ? await hydrateProjectCoverUrl(db, {
        project: projectBundle.project,
        sessionToken: input.sessionToken,
        runtime,
        now: input.now,
        signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
      })
    : projectBundle.project;
  const signedScript =
    runtime && projectBundle.script
      ? await hydrateScriptCoverUrl(db, {
          script: projectBundle.script,
          sessionToken: input.sessionToken,
          runtime,
          now: input.now,
          signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
        })
      : projectBundle.script;
  const signedScripts = runtime
    ? await Promise.all(
        scripts.map((script) =>
          hydrateScriptCoverUrl(db, {
            script,
            sessionToken: input.sessionToken,
            runtime,
            now: input.now,
            signedUrlExpiresInSeconds: input.signedUrlExpiresInSeconds,
          }),
        ),
      )
    : scripts;

  return {
    project: signedProject,
    script: signedScript,
    scripts: signedScripts,
    assetSummary: buildAssetSummary(signedAssetsByType),
    assetsByType: signedAssetsByType,
    episodes: projectEpisodes.map((episode) => {
      const episodeShots = shots.filter((shot) =>
        episode.id === "episode-primary" ? true : shot.episodeId === episode.id,
      );
      return {
        id: episode.id,
        title: episode.title,
        sequence: episode.sequence,
        status: episode.status,
        createdAt: episode.createdAt,
        updatedAt: episode.updatedAt,
        storyboardCount: episodeShots.length,
        previewUrl: findEpisodePreviewUrl(episodeShots, signedAssets),
      };
    }),
    shots: shots.map((shot) => ({
      id: shot.id,
      episodeId: shot.episodeId,
      title: shot.title,
      description: shot.description,
      sortOrder: shot.sortOrder,
      contentRevision: shot.contentRevision,
      imageStatus: shot.imageStatus,
      videoStatus: shot.videoStatus,
      currentImageAssetVersionId: shot.currentImageAssetVersionId,
      currentVideoAssetVersionId: shot.currentVideoAssetVersionId,
      previewImageUrl: findVersionDisplayUrl(signedAssetVersions, shot.currentImageAssetVersionId, "image"),
      previewVideoUrl: findVersionDisplayUrl(signedAssetVersions, shot.currentVideoAssetVersionId, "video"),
      previewVideoThumbnailUrl: findVersionThumbnailUrl(signedAssetVersions, shot.currentVideoAssetVersionId),
      imageVersions: signedVersionsByShotId.get(shot.id)?.image ?? [],
      videoVersions: signedVersionsByShotId.get(shot.id)?.video ?? [],
      references: signedReferencesByShotId.get(shot.id) ?? [],
    })),
    exportHistory: signedExportHistory,
  };
}

async function listAssetsForProject(
  db: SqlDatabase,
  input: { projectId: string },
) {
  const result = await db.query<{
    id: string;
    asset_type: string;
    asset_key: string;
    created_at: Date | string;
    updated_at: Date | string;
    version_id: string | null;
    version_number: number | string | null;
    storage_object_id: string | null;
    storage_object_key: string | null;
    metadata_json: Record<string, unknown> | null;
    version_created_at: Date | string | null;
  }>(
    `
      SELECT
        a.id,
        a.asset_type,
        a.asset_key,
        a.created_at,
        a.updated_at,
        v.id AS version_id,
        v.version_number,
        v.storage_object_id,
        v.storage_object_key,
        v.metadata_json,
        v.created_at AS version_created_at
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT *
        FROM asset_versions
        WHERE asset_id = a.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      WHERE a.project_id = $1
      ORDER BY a.updated_at DESC, a.id DESC
    `,
    [input.projectId],
  );

  return result.rows
    .map((row) => {
      const metadata = parseMetadataJson(row.metadata_json);
      return {
        id: row.id,
        assetType: row.asset_type,
        assetKey: row.asset_key,
        label: metadata?.label ?? row.asset_key,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        previewUrl: getAssetPreviewUrl(row.storage_object_key, metadata),
        latestVersion: row.version_id
          ? {
              id: row.version_id,
              versionNumber: Number(row.version_number),
              storageObjectId: row.storage_object_id,
              storageObjectKey: row.storage_object_key,
              metadata,
              previewUrl: getAssetPreviewUrl(row.storage_object_key, metadata),
              createdAt: row.version_created_at ? new Date(row.version_created_at) : null,
            }
          : null,
      };
    })
    .filter((asset) => {
      const metadata = asset.latestVersion?.metadata;
      return !(metadata && typeof metadata === "object" && typeof metadata.episodeId === "string" && metadata.episodeId);
    });
}

type ListedAsset = Awaited<ReturnType<typeof listAssetsForProject>>[number];

async function listCurrentAssetVersionsForProject(
  db: SqlDatabase,
  input: { projectId: string },
) {
  const result = await db.query<{
    asset_id: string;
    asset_type: string;
    asset_key: string;
    version_id: string;
    version_number: number | string;
    storage_object_id: string | null;
    storage_object_key: string;
    metadata_json: Record<string, unknown> | null;
    source_task_id: string | null;
    source_attempt_id: string | null;
    created_at: Date | string;
  }>(
    `
      SELECT
        a.id AS asset_id,
        a.asset_type,
        a.asset_key,
        v.id AS version_id,
        v.version_number,
        v.storage_object_id,
        v.storage_object_key,
        v.metadata_json,
        v.source_task_id,
        v.source_attempt_id,
        v.created_at
      FROM assets a
      JOIN asset_versions v
        ON v.asset_id = a.id
      WHERE a.project_id = $1
        AND v.id IN (
          SELECT current_image_asset_version_id
          FROM shots
          WHERE project_id = $1
            AND current_image_asset_version_id IS NOT NULL
          UNION
          SELECT current_video_asset_version_id
          FROM shots
          WHERE project_id = $1
            AND current_video_asset_version_id IS NOT NULL
        )
      ORDER BY a.asset_key ASC, v.version_number DESC
    `,
    [input.projectId],
  );

  return result.rows.map((row) => {
    const metadata = parseMetadataJson(row.metadata_json) ?? {};
    return {
      assetId: row.asset_id,
      assetType: row.asset_type,
      assetKey: row.asset_key,
      id: row.version_id,
      versionNumber: Number(row.version_number),
      storageObjectId: row.storage_object_id,
      storageObjectKey: row.storage_object_key,
      metadata,
      sourceTaskId: row.source_task_id,
      sourceAttemptId: row.source_attempt_id,
      previewUrl: getAssetPreviewUrl(row.storage_object_key, metadata),
      createdAt: new Date(row.created_at),
    };
  });
}

type ListedAssetVersion = Awaited<ReturnType<typeof listCurrentAssetVersionsForProject>>[number];

function createEmptyAssetsByType() {
  return {
    character: [] as ListedAsset[],
    scene: [] as ListedAsset[],
    prop: [] as ListedAsset[],
    other: {
      audio: [] as ListedAsset[],
      image: [] as ListedAsset[],
      video: [] as ListedAsset[],
    },
  };
}

function createEmptyAssetSummary() {
  return {
    character: { count: 0, previews: [] as string[] },
    scene: { count: 0, previews: [] as string[] },
    prop: { count: 0, previews: [] as string[] },
    other: { count: 0, previews: [] as string[] },
  };
}

function groupAssetsByUiType(assets: ListedAsset[]) {
  const grouped = createEmptyAssetsByType();
  for (const asset of assets) {
    if (asset.assetType === "character_sheet") {
      grouped.character.push(asset);
    } else if (asset.assetType === "scene_reference") {
      grouped.scene.push(asset);
    } else if (asset.assetType === "prop_reference") {
      grouped.prop.push(asset);
    } else if (asset.assetType === "shot_video") {
      if (isAudioListedAsset(asset)) {
        grouped.other.audio.push(asset);
      } else {
        grouped.other.video.push(asset);
      }
    } else {
      if (isAudioListedAsset(asset)) {
        grouped.other.audio.push(asset);
      } else {
        grouped.other.image.push(asset);
      }
    }
  }
  return grouped;
}

function buildAssetSummary(assetsByType: ReturnType<typeof createEmptyAssetsByType>) {
  return {
    character: summarizeAssets(assetsByType.character),
    scene: summarizeAssets(assetsByType.scene),
    prop: summarizeAssets(assetsByType.prop),
    other: summarizeAssets([...assetsByType.other.audio, ...assetsByType.other.image, ...assetsByType.other.video]),
  };
}

function isAudioListedAsset(asset: ListedAsset) {
  const metadata = asset.latestVersion?.metadata ?? {};
  const mimeType = String(metadata?.mimeType ?? "").trim().toLowerCase();
  if (mimeType.startsWith("audio/")) {
    return true;
  }
  const candidates = [
    asset.previewUrl,
    asset.latestVersion?.previewUrl,
    asset.latestVersion?.storageObjectKey,
    metadata?.sourceUrl,
    metadata?.previewUrl,
  ];
  return candidates.some((candidate) => /\.(mp3|wav|m4a|aac)(?:[?#]|$)/i.test(String(candidate ?? "")));
}

function summarizeAssets(assets: ListedAsset[]) {
  return {
    count: assets.length,
    previews: assets.map((asset) => asset.previewUrl).filter(Boolean).slice(0, 3),
  };
}

function groupShotAssetVersionsByShotId(versions: ListedAssetVersion[]) {
  const grouped = new Map<
    string,
    { image: ListedAssetVersion[]; video: ListedAssetVersion[] }
  >();
  for (const version of versions) {
    if (version.assetType !== "shot_image" && version.assetType !== "shot_video") {
      continue;
    }
    const entry = grouped.get(version.assetKey) ?? { image: [], video: [] };
    if (version.assetType === "shot_video") {
      entry.video.push(version);
    } else {
      entry.image.push(version);
    }
    grouped.set(version.assetKey, entry);
  }
  return grouped;
}

function groupReferencesByShotId(
  references: Awaited<ReturnType<typeof listShotReferencesForProject>>,
) {
  const grouped = new Map<string, typeof references>();
  for (const reference of references) {
    const items = grouped.get(reference.shotId) ?? [];
    items.push(reference);
    grouped.set(reference.shotId, items);
  }
  return grouped;
}

function findVersionDisplayUrl(
  versions: ListedAssetVersion[],
  assetVersionId: string | null,
  mediaKind: "image" | "video",
) {
  if (!assetVersionId) {
    return null;
  }
  const version = versions.find((item) => item.id === assetVersionId);
  if (!version) {
    return null;
  }
  if (mediaKind === "video") {
    const metadata = version.metadata ?? {};
    return (
      readNonEmptyString(metadata.sourceUrl) ??
      readNonEmptyString(metadata.downloadUrl) ??
      readNonEmptyString(metadata.videoUrl) ??
      readNonEmptyString(metadata.previewUrl) ??
      version.previewUrl ??
      null
    );
  }
  return version.previewUrl ?? readNonEmptyString(version.metadata?.previewUrl) ?? null;
}

function readNonEmptyString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function findVersionThumbnailUrl(
  versions: ListedAssetVersion[],
  assetVersionId: string | null,
) {
  if (!assetVersionId) {
    return null;
  }
  const version = versions.find((item) => item.id === assetVersionId);
  if (!version) {
    return null;
  }
  return (
    readNonEmptyString(version.metadata?.thumbnailUrl) ??
    readNonEmptyString(version.metadata?.coverImageUrl) ??
    null
  );
}

function findEpisodePreviewUrl(shots: ShotRecord[], assets: ListedAsset[]) {
  const imageVersionIds = new Set(
    shots.map((shot) => shot.currentImageAssetVersionId).filter(Boolean),
  );
  const videoVersionIds = new Set(
    shots.map((shot) => shot.currentVideoAssetVersionId).filter(Boolean),
  );
  return (
    assets.find((asset) => imageVersionIds.has(asset.latestVersion?.id ?? ""))?.previewUrl ??
    assets.find((asset) => videoVersionIds.has(asset.latestVersion?.id ?? ""))?.previewUrl ??
    null
  );
}

function getAssetPreviewUrl(
  storageObjectKey: string | null,
  metadata: Record<string, unknown> | null,
) {
  const previewUrl = metadata?.previewUrl ?? metadata?.sourceUrl;
  if (typeof previewUrl === "string" && previewUrl.trim()) {
    return previewUrl;
  }
  if (typeof storageObjectKey === "string" && storageObjectKey.startsWith("data:")) {
    return storageObjectKey;
  }
  return null;
}

function buildDirectStoragePublicUrl(storageObjectKey: string | null) {
  if (typeof storageObjectKey !== "string") {
    return null;
  }
  const normalizedKey = storageObjectKey.trim();
  if (!normalizedKey) {
    return null;
  }
  if (/^(?:https?:)?\/\//i.test(normalizedKey) || normalizedKey.startsWith("data:")) {
    return normalizedKey;
  }
  const publicBaseUrl =
    process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/+$/g, "") ||
    process.env.STORAGE_ENDPOINT?.trim().replace(/\/+$/g, "") ||
    "";
  return publicBaseUrl ? `${publicBaseUrl}/${normalizedKey.replace(/^\/+/g, "")}` : null;
}

function parseMetadataJson(value: Record<string, unknown> | string | null | undefined) {
  if (!value) {
    return null;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return value;
}

async function resolveStorageBackedPreviewUrl(
  db: SqlDatabase,
  input: {
    sessionToken: string;
    storageObjectId: string | null;
    storageObjectKey: string | null;
    metadata: Record<string, unknown> | null;
    now: Date;
    runtime: UploadSessionRuntime;
    signedUrlExpiresInSeconds: number;
  },
) {
  const explicitPreviewUrl = getAssetPreviewUrl(input.storageObjectKey, input.metadata);
  if (explicitPreviewUrl) {
    return explicitPreviewUrl;
  }
  if (
    !input.storageObjectId &&
    typeof input.metadata?.generationTaskId === "string" &&
    input.metadata.generationTaskId.trim()
  ) {
    return null;
  }
  const directStorageUrl = buildDirectStoragePublicUrl(input.storageObjectKey);
  if (directStorageUrl) {
    return directStorageUrl;
  }
  if (input.storageObjectId) {
    try {
      const urls = await buildSignedObjectUrls(db, {
        sessionToken: input.sessionToken,
        storageObjectId: input.storageObjectId,
        adapter: input.runtime.adapter,
        now: input.now,
        expiresInSeconds: input.signedUrlExpiresInSeconds,
      });
      return urls.previewUrl;
    } catch {
      return getAssetPreviewUrl(input.storageObjectKey, input.metadata);
    }
  }
  return getAssetPreviewUrl(input.storageObjectKey, input.metadata);
}

async function hydrateProjectCoverUrl(
  db: SqlDatabase,
  input: {
    project: CreatorDevStateSnapshot["project"];
    sessionToken: string;
    runtime: UploadSessionRuntime;
    now: Date;
    signedUrlExpiresInSeconds: number;
  },
) {
  if (!input.project?.coverStorageObjectId) {
    return input.project;
  }
  try {
    const urls = await buildSignedObjectUrls(db, {
      sessionToken: input.sessionToken,
      storageObjectId: input.project.coverStorageObjectId,
      adapter: input.runtime.adapter,
      now: input.now,
      expiresInSeconds: input.signedUrlExpiresInSeconds,
    });
    return {
      ...input.project,
      coverImageUrl: urls.previewUrl,
    };
  } catch {
    return input.project;
  }
}

async function hydrateScriptCoverUrl<T extends { coverStorageObjectId?: string | null; coverImageUrl?: string | null }>(
  db: SqlDatabase,
  input: {
    script: T;
    sessionToken: string;
    runtime: UploadSessionRuntime;
    now: Date;
    signedUrlExpiresInSeconds: number;
  },
): Promise<T> {
  if (!input.script?.coverStorageObjectId) {
    return input.script;
  }
  try {
    const urls = await buildSignedObjectUrls(db, {
      sessionToken: input.sessionToken,
      storageObjectId: input.script.coverStorageObjectId,
      adapter: input.runtime.adapter,
      now: input.now,
      expiresInSeconds: input.signedUrlExpiresInSeconds,
    });
    return {
      ...input.script,
      coverImageUrl: urls.previewUrl,
    };
  } catch {
    return input.script;
  }
}

async function listScriptsForProjectDetail(
  db: SqlDatabase,
  input: {
    projectId: string;
  },
): Promise<ScriptRecord[]> {
  const result = await db.query<{
    id: string;
    project_id: string;
    title: string | null;
    cover_image_url: string | null;
    cover_storage_object_id: string | null;
    deleted_at: Date | string | null;
    status: "draft" | "ready" | "parsed" | "failed";
    input_text: string;
    created_by_user_id: string;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT *
      FROM scripts
      WHERE project_id = $1
        AND deleted_at IS NULL
      ORDER BY updated_at DESC, created_at DESC, id DESC
    `,
    [input.projectId],
  );

  return result.rows.map((script) => ({
    id: script.id,
    projectId: script.project_id,
    title: script.title,
    coverImageUrl: script.cover_image_url,
    coverStorageObjectId: script.cover_storage_object_id,
    deletedAt: script.deleted_at ? new Date(script.deleted_at) : null,
    status: script.status,
    inputText: script.input_text,
    createdByUserId: script.created_by_user_id,
    createdAt: new Date(script.created_at),
    updatedAt: new Date(script.updated_at),
  }));
}

async function listScriptsForUser(
  db: SqlDatabase,
  input: {
    userId: string;
    page: number;
    pageSize: number;
    includeUntitled?: boolean;
    visibleScriptIds?: string[] | null;
  },
): Promise<{
  scripts: Array<ScriptRecord & {
    projectName: string;
    projectPhase: ProjectRecord["phase"];
    projectUpdatedAt: Date;
    sectionCount: number;
  }>;
  total: number;
}> {
  const params: unknown[] = [input.userId];
  const whereClauses = [
    "p.owner_user_id = $1",
    "s.deleted_at IS NULL",
  ];
  if (input.includeUntitled !== true) {
    whereClauses.push("s.title IS NOT NULL");
  }
  if (Array.isArray(input.visibleScriptIds)) {
    if (!input.visibleScriptIds.length) {
      return { scripts: [], total: 0 };
    }
    params.push(input.visibleScriptIds);
    whereClauses.push(`s.id = ANY($${params.length}::uuid[])`);
  }
  const whereSql = whereClauses.join("\n        AND ");
  const totalRow = await queryOne<{ total: number | string }>(
    db,
    `
      SELECT COUNT(*) AS total
      FROM scripts s
      INNER JOIN projects p
        ON p.id = s.project_id
      WHERE ${whereSql}
    `,
    params,
  );
  const total = Math.max(0, Number(totalRow?.total ?? 0));
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / input.pageSize)));
  const offset = (page - 1) * input.pageSize;
  const pageParams = [...params, input.pageSize, offset];
  const result = await db.query<{
    id: string;
    project_id: string;
    title: string | null;
    cover_image_url: string | null;
    cover_storage_object_id: string | null;
    deleted_at: Date | string | null;
    status: "draft" | "ready" | "parsed" | "failed";
    created_by_user_id: string;
    created_at: Date | string;
    updated_at: Date | string;
    project_name: string;
    project_phase: ProjectRecord["phase"];
    project_updated_at: Date | string;
    section_count: number | string | null;
  }>(
    `
      SELECT
        s.id,
        s.project_id,
        s.title,
        s.cover_image_url,
        s.cover_storage_object_id,
        s.deleted_at,
        s.status,
        s.created_by_user_id,
        s.created_at,
        s.updated_at,
        p.name AS project_name,
        p.phase AS project_phase,
        p.updated_at AS project_updated_at,
        COALESCE(section_counts.section_count, 0) AS section_count
      FROM scripts s
      INNER JOIN projects p
        ON p.id = s.project_id
      LEFT JOIN (
        SELECT
          project_id,
          script_id,
          COUNT(*) AS section_count
        FROM script_reader_sections
        WHERE status <> 'archived'
        GROUP BY project_id, script_id
      ) section_counts
        ON section_counts.project_id = s.project_id
       AND section_counts.script_id = s.id
      WHERE ${whereSql}
      ORDER BY s.updated_at DESC, s.created_at DESC, s.id DESC
      LIMIT $${pageParams.length - 1}
      OFFSET $${pageParams.length}
    `,
    pageParams,
  );

  return {
    scripts: result.rows.map((script) => ({
      id: script.id,
      projectId: script.project_id,
      title: script.title?.trim() || script.project_name,
      coverImageUrl: script.cover_image_url,
      coverStorageObjectId: script.cover_storage_object_id,
      deletedAt: script.deleted_at ? new Date(script.deleted_at) : null,
      status: script.status,
      inputText: "",
      createdByUserId: script.created_by_user_id,
      createdAt: new Date(script.created_at),
      updatedAt: new Date(script.updated_at),
      projectName: script.project_name,
      projectPhase: script.project_phase,
      projectUpdatedAt: new Date(script.project_updated_at),
      sectionCount: Number(script.section_count ?? 0),
    })),
    total,
  };
}

async function listTeamMemberProjectIds(
  db: SqlDatabase,
  input: { userId: string; memberId: string },
) {
  const result = await db.query<{ project_id: string }>(
    `
      SELECT project_id::text AS project_id
      FROM team_member_projects
      WHERE user_id = $1
        AND member_id = $2
      ORDER BY created_at ASC, id ASC
    `,
    [input.userId, input.memberId],
  );

  return result.rows.map((row) => row.project_id);
}

async function listTeamMemberScriptIds(
  db: SqlDatabase,
  input: { userId: string; memberId: string },
) {
  const result = await db.query<{ script_id: string }>(
    `
      SELECT script_id::text AS script_id
      FROM team_member_scripts
      WHERE user_id = $1
        AND member_id = $2
      ORDER BY created_at ASC, id ASC
    `,
    [input.userId, input.memberId],
  );

  return result.rows.map((row) => row.script_id);
}

async function listTeamMemberCanvasIds(
  db: SqlDatabase,
  input: { userId: string; memberId: string },
) {
  const result = await db.query<{ canvas_id: string }>(
    `
      SELECT canvas_id::text AS canvas_id
      FROM team_member_canvases
      WHERE user_id = $1
        AND member_id = $2
      ORDER BY created_at ASC, id ASC
    `,
    [input.userId, input.memberId],
  );

  return result.rows.map((row) => row.canvas_id);
}

async function buildSignedExportRecord(
  db: SqlDatabase,
  input: {
    record: Awaited<ReturnType<typeof listExportRecordsForProject>>[number];
    sessionToken: string;
    runtime: UploadSessionRuntime;
    now: Date;
    signedUrlExpiresInSeconds: number;
  },
) {
  try {
    const urls = await buildSignedObjectUrls(db, {
      sessionToken: input.sessionToken,
      storageObjectId: input.record.storageObjectId,
      adapter: input.runtime.adapter,
      now: input.now,
      expiresInSeconds: input.signedUrlExpiresInSeconds,
    });
    return {
      ...input.record,
      signedUrl: urls.downloadUrl,
      sourceUrl: urls.sourceUrl,
      downloadUrl: urls.downloadUrl,
      expiresAt: urls.expiresAt,
    };
  } catch {
    return input.record;
  }
}

async function listAssetVersions(
  db: SqlDatabase,
  input: { assetId: string },
) {
  const result = await db.query<{
    id: string;
    version_number: number | string;
    storage_object_id: string | null;
    storage_object_key: string;
    metadata_json: Record<string, unknown>;
    source_task_id: string | null;
    source_attempt_id: string | null;
    created_at: Date | string;
  }>(
    `
      SELECT
        id,
        version_number,
        storage_object_id,
        storage_object_key,
        metadata_json,
        source_task_id,
        source_attempt_id,
        created_at
      FROM asset_versions
      WHERE asset_id = $1
      ORDER BY version_number DESC
    `,
    [input.assetId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    versionNumber: Number(row.version_number),
    storageObjectId: row.storage_object_id,
    storageObjectKey: row.storage_object_key,
    metadata: row.metadata_json,
    sourceTaskId: row.source_task_id,
    sourceAttemptId: row.source_attempt_id,
    createdAt: new Date(row.created_at),
  }));
}

function assetTypeForKind(kind: "character" | "scene" | "prop" | "image" | "video"): AssetType {
  if (kind === "character") {
    return "character_sheet";
  }
  if (kind === "scene") {
    return "scene_reference";
  }
  if (kind === "prop") {
    return "prop_reference";
  }
  return kind === "video" ? "shot_video" : "shot_image";
}

async function createAiPreviewEpisodeAssets(
  db: SqlDatabase,
  input: {
    projectId: string;
    episodeId: string;
    kind: "character" | "scene" | "prop";
    records: Array<Record<string, unknown>>;
    createdByUserId: string;
    now: Date;
  },
) {
  const created: Array<Awaited<ReturnType<typeof createAssetVersionSnapshot>>> = [];
  for (let index = 0; index < input.records.length; index += 1) {
    const record = input.records[index]!;
    const name = resolveAiPreviewAssetName(input.kind, record, index);
    if (!name) {
      continue;
    }
    const description = resolveAiPreviewAssetDescription(input.kind, record);
    const prompt = resolveAiPreviewAssetPrompt(input.kind, record);
    const assetKey = `episode-${input.kind}-${slugForAssetKey(name)}-${randomUUID().slice(0, 8)}`;
    created.push(await createAssetVersionSnapshot(db, {
      projectId: input.projectId,
      assetType: assetTypeForKind(input.kind),
      assetKey,
      createdByUserId: input.createdByUserId,
      storageObjectId: null,
      storageObjectKey: `episodes/${input.episodeId}/assets/${input.kind}/${assetKey}`,
      metadata: {
        mimeType: "application/json",
        width: 1,
        height: 1,
        episodeId: input.episodeId,
        label: name,
        description,
        prompt,
        source: "ai_storyboard_preview",
        previewUrl: null,
      },
      sourceTaskId: null,
      sourceAttemptId: null,
      now: input.now,
    }));
  }
  return created;
}

function aiPreviewStoryboardToShot(input: {
  projectId: string;
  episodeId: string;
  storyboard: Record<string, unknown>;
  index: number;
  createdByUserId: string;
  now: Date;
}): ShotRecord {
  const shotNo = Number(input.storyboard.shotNo ?? input.storyboard.shot_no ?? input.index + 1);
  const plot = firstAiPreviewText(input.storyboard, ["plot", "description", "story", "summary", "sceneAnalysis", "scene_analysis"]);
  const dialogue = firstAiPreviewText(input.storyboard, ["dialogue", "dialogue_or_os", "dialog", "voiceover", "narration"]);
  const imagePrompt = firstAiPreviewText(input.storyboard, ["imagePrompt", "image_prompt", "staticImagePrompt", "static_image_prompt"]);
  const videoPrompt =
    firstAiPreviewText(input.storyboard, ["chapterVideoPrompt", "chapter_video_prompt"]) ||
    firstAiPreviewText(input.storyboard, ["videoPrompt", "video_prompt", "motionPrompt", "motion_prompt"]);
  const fallbackDescription = [plot, dialogue].filter(Boolean).join("\n\n");
  const storyboardDescription = buildAiPreviewStoryboardDescription(input.storyboard);
  const description = fallbackDescription || storyboardDescription || imagePrompt || videoPrompt || `AI 分镜 ${input.index + 1}`;
  return {
    id: randomUUID(),
    projectId: input.projectId,
    episodeId: input.episodeId,
    title: `分镜 ${Number.isFinite(shotNo) && shotNo > 0 ? shotNo : input.index + 1}`,
    description,
    sortOrder: input.index,
    contentRevision: 1,
    contentStatus: "ready",
    imageStatus: imagePrompt ? "ready" : "draft",
    videoStatus: videoPrompt ? "ready" : "not_ready",
    currentImageAssetVersionId: null,
    currentVideoAssetVersionId: null,
    activeImageTaskId: null,
    activeImageRevision: null,
    activeVideoTaskId: null,
    activeVideoImageAssetVersionId: null,
    completedImageAssetVersionIds: [],
    completedVideoAssetVersionIds: [],
    createdByUserId: input.createdByUserId,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function buildAiPreviewStoryboardDescription(storyboard: Record<string, unknown>) {
  const lines = [
    ["分镜剧情", firstAiPreviewText(storyboard, ["plot", "description", "story", "summary", "sceneAnalysis", "scene_analysis"])],
    ["对白/旁白", firstAiPreviewText(storyboard, ["dialogue", "dialogue_or_os", "dialog", "voiceover", "narration"])],
    ["时间", firstAiPreviewText(storyboard, ["timeRange", "time_range", "originalTimeRange", "original_time_range"])],
    ["转场", firstAiPreviewText(storyboard, ["transition", "cut", "transitionType", "transition_type"])],
    ["镜头", [
      firstAiPreviewText(storyboard, ["shotSize", "shot_size", "cameraShot", "camera_shot"]),
      firstAiPreviewText(storyboard, ["cameraAngle", "camera_angle", "angle"]),
      firstAiPreviewText(storyboard, ["cameraMovement", "camera_movement", "movement"]),
    ].filter(Boolean).join("/")],
    ["画面描述", firstAiPreviewText(storyboard, ["visualDescription", "visual_description", "pictureDescription", "picture_description", "frameDescription", "frame_description"])],
    ["核心动作", firstAiPreviewText(storyboard, ["coreAction", "core_action", "keyAction", "key_action"])],
    ["对手戏设计", firstAiPreviewText(storyboard, ["interactionDesign", "interaction_design", "opponentInteraction", "opponent_interaction"])],
    ["人物底层逻辑", firstAiPreviewText(storyboard, ["characterLogic", "character_logic", "innerLogic", "inner_logic"])],
    ["主体动作", firstAiPreviewText(storyboard, ["subjectAction", "subject_action", "mainAction", "main_action"])],
    ["音效", firstAiPreviewText(storyboard, ["soundEffect", "sound_effect", "sfx"])],
    ["配乐", firstAiPreviewText(storyboard, ["bgm", "music", "score"])],
  ];
  const values: string[] = [];
  const seen = new Set<string>();
  for (const [label, value] of lines) {
    const textValue = String(value ?? "").trim();
    if (!textValue || seen.has(textValue)) {
      continue;
    }
    seen.add(textValue);
    values.push(`${label}: ${textValue}`);
  }
  return values.join("\n");
}

function resolveAiPreviewAssetName(
  kind: "character" | "scene" | "prop",
  record: Record<string, unknown>,
  index: number,
) {
  const keys = kind === "character"
    ? ["characterName", "character_name", "name", "role", "character"]
    : kind === "scene"
      ? ["sceneName", "scene_name", "name", "location", "scene"]
      : ["propName", "prop_name", "name", "prop"];
  return firstAiPreviewText(record, keys) || `${kind}-${index + 1}`;
}

function resolveAiPreviewAssetDescription(kind: "character" | "scene" | "prop", record: Record<string, unknown>) {
  const keys = kind === "character"
    ? [
      "rawCharacterDescription",
      "raw_character_description",
      "characterDescription",
      "character_description",
      "description",
      "appearance",
      "summary",
      "age",
      "nationality",
      "gender",
      "costume",
      "clothing",
      "face",
      "facialFeatures",
      "detailFeatures",
      "bodyFeatures",
      "personality",
      "characterImagePrompt",
      "character_image_prompt",
      "imagePrompt",
      "image_prompt",
      "prompt",
    ]
    : kind === "scene"
      ? [
        "rawSceneDescription",
        "raw_scene_description",
        "sceneDescription",
        "scene_description",
        "description",
        "summary",
        "environment",
        "weather",
        "time",
        "timeOfDay",
        "spaceStructure",
        "architecturalStyle",
        "buildingStyle",
        "buildingDetails",
        "lighting",
        "lightingRules",
        "atmosphere",
        "keyProps",
        "sceneImagePrompt",
        "scene_image_prompt",
        "imagePrompt",
        "image_prompt",
        "prompt",
      ]
      : [
        "rawPropDescription",
        "raw_prop_description",
        "propDescription",
        "prop_description",
        "description",
        "summary",
        "usage",
        "appearance",
        "color",
        "material",
        "size",
        "state",
        "ownerOrUser",
        "firstAppearance",
        "consistency",
        "propImagePrompt",
        "prop_image_prompt",
        "imagePrompt",
        "image_prompt",
        "prompt",
      ];
  return joinAiPreviewText(record, keys);
}

function resolveAiPreviewAssetPrompt(kind: "character" | "scene" | "prop", record: Record<string, unknown>) {
  const keys = kind === "character"
    ? ["characterImagePrompt", "character_image_prompt", "imagePrompt", "image_prompt", "prompt"]
    : kind === "scene"
      ? ["sceneImagePrompt", "scene_image_prompt", "imagePrompt", "image_prompt", "prompt"]
      : ["propImagePrompt", "prop_image_prompt", "imagePrompt", "image_prompt", "prompt"];
  return firstAiPreviewText(record, keys);
}

function firstAiPreviewText(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const joined = value.map((item) => String(item ?? "").trim()).filter(Boolean).join("、");
      if (joined) {
        return joined;
      }
      continue;
    }
    const textValue = String(value ?? "").trim();
    if (textValue) {
      return textValue;
    }
  }
  return "";
}

function joinAiPreviewText(record: Record<string, unknown>, keys: string[]) {
  const values: string[] = [];
  for (const key of keys) {
    const value = record[key];
    const textValue = Array.isArray(value)
      ? value.map((item) => String(item ?? "").trim()).filter(Boolean).join("、")
      : String(value ?? "").trim();
    if (!textValue || aiPreviewTextContains(values, textValue)) {
      continue;
    }
    for (let index = values.length - 1; index >= 0; index -= 1) {
      if (aiPreviewTextIncludes(textValue, values[index]!)) {
        values.splice(index, 1);
      }
    }
    values.push(textValue);
  }
  return values.join("\n");
}

function aiPreviewTextContains(values: string[], candidate: string) {
  return values.some((value) => aiPreviewTextIncludes(value, candidate));
}

function aiPreviewTextIncludes(container: string, candidate: string) {
  const normalizedContainer = normalizeAiPreviewComparableText(container);
  const normalizedCandidate = normalizeAiPreviewComparableText(candidate);
  return Boolean(normalizedCandidate && normalizedContainer.includes(normalizedCandidate));
}

function normalizeAiPreviewComparableText(value: string) {
  return String(value ?? "").replace(/\s+/g, "");
}

function slugForAssetKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-").replace(/^-+|-+$/g, "") || "asset";
}

function cleanOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseLibraryAssetScope(value?: string | null): LibraryAssetScope | null {
  const normalized = value?.trim() || "official";
  if (normalized === "official" || normalized === "team" || normalized === "personal") {
    return normalized;
  }
  return null;
}

function parseLibraryAssetCategory(
  value?: string | null,
): LibraryAssetCategory | "invalid" | null {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }
  if (
    normalized === "character" ||
    normalized === "scene" ||
    normalized === "prop" ||
    normalized === "image" ||
    normalized === "video"
  ) {
    return normalized;
  }
  return "invalid";
}

function stableEpisodeUuid(projectId: string, sourceEpisodeId: string) {
  const hex = createHash("sha256")
    .update(`${projectId}:${sourceEpisodeId}`)
    .digest("hex")
    .slice(0, 32);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function filterRequestedShots(
  shots: CreatorDevStateSnapshot["shots"],
  shotId?: string | null,
) {
  if (!shotId) {
    return shots;
  }
  return shots.filter((shot) => shot.id === shotId);
}

function createFixedImageGenerationResults(
  promptOverride?: string | null,
  selectionContext?: Record<string, unknown> | null,
) {
  const prompt = promptOverride?.trim() || "Fixed local image generation result.";
  return [
    {
      id: "fixed-character-sheet-1",
      kind: "image",
      label: "图片",
      prompt,
      selectionContext,
      url:
        "data:image/svg+xml;charset=UTF-8," +
        encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 320">
            <rect width="360" height="320" fill="#f6f5f0"/>
            <path d="M22 42c20-24 57-24 80 4 18 22 19 52 3 81-17 31-42 53-72 71-18-49-27-102-11-156Z" fill="#17191e"/>
            <path d="M88 42c44-18 84 12 78 58-5 38-39 68-75 78-15-48-17-92-3-136Z" fill="#22262d"/>
            <circle cx="72" cy="94" r="33" fill="#e9c2ab"/>
            <path d="M39 88c14-36 56-51 89-31-3 30-24 52-58 66-9-8-19-18-31-35Z" fill="#15171c"/>
            <path d="M143 65c28-33 78-31 104 2 20 26 22 61 4 96-19 38-50 62-89 74-18-60-28-123-19-172Z" fill="#191b20"/>
            <circle cx="195" cy="125" r="34" fill="#e3b69e"/>
            <path d="M166 112c12-42 63-61 97-32-2 32-24 57-62 75-10-9-22-23-35-43Z" fill="#111317"/>
            <path d="M170 160h58l14 108H154l16-108Z" fill="#20242b"/>
            <path d="M163 184h74" stroke="#868a94" stroke-width="8" stroke-linecap="round"/>
            <path d="M264 68c25-30 71-28 95 3v249h-95V68Z" fill="#17191f"/>
            <circle cx="311" cy="126" r="32" fill="#e4b69e"/>
            <path d="M283 112c11-39 57-56 89-29-5 31-27 54-61 70-9-9-18-22-28-41Z" fill="#111318"/>
            <path d="M286 160h54l13 112h-78l11-112Z" fill="#252a31"/>
          </svg>
        `),
    },
  ];
}

async function updateProjectPhase(
  db: SqlDatabase,
  projectId: string,
  phase: "shot_generation" | "export",
) {
  await db.query(
    `
      UPDATE projects
      SET phase = $2,
          updated_at = now()
      WHERE id = $1
    `,
    [projectId, phase],
  );
}

async function updateShotMediaPointer(
  db: SqlDatabase,
  input: {
    projectId: string;
    shotId: string;
    kind: "image" | "video";
    assetVersionId: string;
    now: Date;
  },
): Promise<ShotRecord | null> {
  const row = (
    await db.query<{
      id: string;
      project_id: string;
      episode_id: string | null;
      title: string;
      description: string;
      sort_order: number | string;
      content_revision: number;
      content_status: ShotRecord["contentStatus"];
      image_status: ShotRecord["imageStatus"];
      video_status: ShotRecord["videoStatus"];
      current_image_asset_version_id: string | null;
      active_image_task_id: string | null;
      active_image_revision: number | null;
      current_video_asset_version_id: string | null;
      active_video_task_id: string | null;
      active_video_image_asset_version_id: string | null;
      created_by_user_id: string | null;
      created_at: Date | string;
      updated_at: Date | string;
    }>(
      input.kind === "image"
        ? `
          UPDATE shots
          SET current_image_asset_version_id = $3,
              image_status = 'completed',
              video_status = 'ready',
              current_video_asset_version_id = NULL,
              active_image_task_id = NULL,
              active_image_revision = NULL,
              active_video_task_id = NULL,
              active_video_image_asset_version_id = NULL,
              updated_at = $4
          WHERE project_id = $1
            AND id = $2
          RETURNING *
        `
        : `
          UPDATE shots
          SET current_video_asset_version_id = $3,
              video_status = 'completed',
              active_video_task_id = NULL,
              active_video_image_asset_version_id = NULL,
              updated_at = $4
          WHERE project_id = $1
            AND id = $2
          RETURNING *
        `,
      [
        input.projectId,
        input.shotId,
        input.assetVersionId,
        input.now,
      ],
    )
  ).rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    projectId: row.project_id,
    episodeId: row.episode_id,
    title: row.title,
    description: row.description ?? "",
    sortOrder: Number(row.sort_order),
    contentRevision: row.content_revision,
    contentStatus: row.content_status,
    imageStatus: row.image_status,
    videoStatus: row.video_status,
    currentImageAssetVersionId: row.current_image_asset_version_id,
    currentVideoAssetVersionId: row.current_video_asset_version_id,
    activeImageTaskId: row.active_image_task_id,
    activeImageRevision: row.active_image_revision,
    activeVideoTaskId: row.active_video_task_id,
    activeVideoImageAssetVersionId: row.active_video_image_asset_version_id,
    completedImageAssetVersionIds: row.current_image_asset_version_id
      ? [row.current_image_asset_version_id]
      : [],
    completedVideoAssetVersionIds: row.current_video_asset_version_id
      ? [row.current_video_asset_version_id]
      : [],
    createdByUserId: row.created_by_user_id ?? "",
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function calibrationDecisionEventType(decisionType: string): string {
  if (decisionType === "skipped") {
    return "calibration.skipped";
  }

  if (decisionType === "override") {
    return "calibration.override";
  }

  return "calibration.passed";
}

function calibrationErrorResponse(
  error: unknown,
): CreatorHttpResponse<Record<string, unknown>> {
  if (error instanceof CalibrationRuleError) {
    return {
      status: error.code === "reason_required" ? 400 : 409,
      body: { error: error.code },
    };
  }

  throw error;
}

async function findProjectShot(
  db: SqlDatabase,
  input: {
    projectId: string;
    shotId: string;
  },
): Promise<ShotRecord | undefined> {
  const shots = await listShotsForProject(db, {
    projectId: input.projectId,
  });
  return shots.find((shot) => shot.id === input.shotId);
}

async function hydrateStateFromSql(
  db: SqlDatabase,
  state: CreatorDevStateSnapshot,
  input: {
    projectId: string;
    scriptId: string | null;
    sessionToken: string;
    now: Date;
  },
): Promise<CreatorDevStateSnapshot> {
  const actor = await resolveUserActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    now: input.now,
  });
  const records = await listAssetReviewCandidatesForProject(db, {
    projectId: input.projectId,
  });
  const projectBundle = await loadProjectBundleFromSql(db, {
    projectId: input.projectId,
    scriptId: input.scriptId,
  });
  const shots = await listShotsForProject(db, {
    projectId: input.projectId,
  });
  const calibration = await getLatestCalibrationSessionForProject(db, {
    projectId: input.projectId,
  });
  const assetCandidates = records.length > 0 ? assetReviewStateFromRecords(records) : state.assetCandidates;
  return {
    ...state,
    project: projectBundle?.project ?? state.project,
    script: projectBundle?.script ?? state.script,
    shots: shots.length > 0
      ? shots.map((shot) => ({
          id: shot.id,
          episodeId: shot.episodeId,
          title: shot.title,
          description: shot.description,
          contentRevision: shot.contentRevision,
          imageStatus: shot.imageStatus,
          videoStatus: shot.videoStatus,
          currentImageAssetVersionId: shot.currentImageAssetVersionId,
          currentVideoAssetVersionId: shot.currentVideoAssetVersionId,
        }))
      : state.shots,
    calibration: calibration ?? state.calibration,
    assetCandidates,
    assetReview: assetCandidates ? computeAssetReviewSummary(assetCandidates) : state.assetReview,
  };
}

async function loadProjectBundleFromSql(
  db: SqlDatabase,
  input: {
    projectId: string;
    scriptId: string | null;
  },
): Promise<{
  project: CreatorDevStateSnapshot["project"];
  script: CreatorDevStateSnapshot["script"];
} | null> {
  const projectResult = await db.query<{
    id: string;
    owner_user_id: string;
    name: string;
    cover_image_url: string | null;
    cover_storage_object_id: string | null;
    aspect_ratio: string;
    resolution: string;
    phase: "script_input" | "asset_review" | "shot_generation" | "export";
    created_by_user_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT *
      FROM projects
      WHERE id = $1
      LIMIT 1
    `,
    [input.projectId],
  );
  const project = projectResult.rows[0];
  if (!project) {
    return null;
  }

  const scriptResult = await db.query<{
    id: string;
    project_id: string;
    title: string | null;
    cover_image_url: string | null;
    cover_storage_object_id: string | null;
    deleted_at: Date | string | null;
    status: "draft" | "ready" | "parsed" | "failed";
    input_text: string;
    created_by_user_id: string | null;
    created_at: Date | string;
    updated_at: Date | string;
  }>(
    `
      SELECT *
      FROM scripts
      WHERE project_id = $1
        AND ($2::uuid IS NULL OR id = $2::uuid)
        AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.projectId, input.scriptId],
  );
  const script = scriptResult.rows[0];

  return {
    project: {
      id: project.id,
      userId: project.owner_user_id,
      name: project.name,
      coverImageUrl: project.cover_image_url,
      coverStorageObjectId: project.cover_storage_object_id,
      aspectRatio: project.aspect_ratio,
      resolution: project.resolution,
      phase: project.phase,
      createdByUserId: project.created_by_user_id,
      createdAt: new Date(project.created_at),
      updatedAt: new Date(project.updated_at),
    },
    script: script
      ? {
          id: script.id,
          projectId: script.project_id,
          title: script.title,
          coverImageUrl: script.cover_image_url,
          coverStorageObjectId: script.cover_storage_object_id,
          deletedAt: script.deleted_at ? new Date(script.deleted_at) : null,
          status: script.status,
          inputText: script.input_text,
          createdByUserId: script.created_by_user_id,
          createdAt: new Date(script.created_at),
          updatedAt: new Date(script.updated_at),
        }
      : null,
  };
}

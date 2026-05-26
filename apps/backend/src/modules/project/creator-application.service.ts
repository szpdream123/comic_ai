import { createHash, randomUUID } from "node:crypto";

import { appendAuditEvent, type AuditEventRecord } from "../audit/audit.service.ts";
import { hasExternalProviderSubmissionStartedForTask } from "../model-gateway/provider-request.service.ts";
import { resolveActorContext } from "../organization/actor-context.service.ts";
import { capabilities, type Capability } from "../../../../../packages/contracts/domain/capabilities.ts";
import { operationNames, type OperationName } from "../../../../../packages/contracts/domain/operation-names.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
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
import { replaceCalibrationSessionForProject } from "./calibration-record.service.ts";
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
  deleteEpisodeForProject,
  listEpisodesForProject,
  replaceEpisodesForProject,
  updateEpisodeForProject,
} from "./episode-record.service.ts";
import {
  createCreatorExportArtifact,
  requestCreatorImageGenerationPlatformBatch,
  requestCreatorVideoGenerationPlatformBatch,
} from "./creator-platform.service.ts";
import {
  createEpisodeForProject,
  deleteEpisodeForProject,
  listEpisodesForProject,
  replaceEpisodesForProject,
  updateEpisodeForProject,
} from "./episode-record.service.ts";
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
import type { ProjectBundle } from "./project.service.ts";
import type { ShotRecord } from "./shot.service.ts";

interface AuthenticatedCreatorUser {
  id: string;
  sessionToken: string;
}

export interface CreatorHttpResponse<T> {
  status: number;
  body: T;
}

interface CreatorApplicationDeps {
  db: SqlDatabase;
  workspaceId: string;
  creatorApps?: Map<string, CreatorDevApp>;
  creatorSqlStates?: Map<string, CreatorSqlState>;
}

export function createCreatorApplication(deps: CreatorApplicationDeps) {
  const creatorApps = deps.creatorApps ?? new Map<string, CreatorDevApp>();
  const creatorSqlStates = deps.creatorSqlStates ?? new Map<string, CreatorSqlState>();

  function getCreatorState(userId: string) {
    return getCreatorDevState({ userId, creatorApps, creatorSqlStates });
  }

  async function ensureSqlState(userId: string, sqlState: CreatorSqlState) {
    return ensureCreatorSqlState({
      db: deps.db,
      workspaceId: deps.workspaceId,
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
      kind: "character" | "scene" | "prop" | "image" | "video";
      name?: string | null;
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
    const projectId = sqlState.projectId ?? state.project?.id ?? null;
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
    const actor = await resolveActorContext(deps.db, {
      sessionToken: input.user.sessionToken,
      projectId,
      now: input.now,
    });
    const assetType = assetTypeForKind(input.body.kind);
    const assetKey = `${input.body.kind}-${name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")}-${randomUUID().slice(0, 8)}`;
    const asset = {
      id: randomUUID(),
      organizationId: actor.organizationId,
      projectId,
      assetType,
      assetKey,
      createdByUserId: actor.actorId,
      createdAt: input.now,
      updatedAt: input.now,
    };
    const version = {
      id: randomUUID(),
      organizationId: actor.organizationId,
      assetId: asset.id,
      versionNumber: 1,
      storageObjectKey:
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
        sourceUrl: input.body.sourceUrl?.trim() || null,
        previewUrl:
          input.body.sourceUrl?.trim() ||
          (input.body.storageObjectKey?.trim().startsWith("data:")
            ? input.body.storageObjectKey.trim()
            : null),
      },
      sourceTaskId: randomUUID(),
      sourceAttemptId: randomUUID(),
      createdByUserId: actor.actorId,
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
      const result = await handleCreateProject({
        auth: { sessionToken: input.user.sessionToken },
        body: {
          workspaceId: deps.workspaceId,
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

    async listProjects(input: {
      user: AuthenticatedCreatorUser;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        workspaceId: deps.workspaceId,
        now: input.now,
      });
      const projects = await listProjectsForWorkspace(deps.db, {
        organizationId: actor.organizationId,
        workspaceId: deps.workspaceId,
      });
      return {
        status: 200,
        body: { projects },
      };
    },

    async selectProject(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const { creatorApp, sqlState } = getCreatorState(input.user.id);
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const bundle = await loadProjectBundleFromSql(deps.db, {
        projectId: input.projectId,
        scriptId: null,
      });
      if (!bundle || bundle.project?.workspaceId !== actor.workspaceId) {
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
      await creatorApp.seedShotRecords(
        await listShotsForProject(deps.db, {
          organizationId: actor.organizationId,
          projectId: input.projectId,
        }),
      );

      return {
        status: 200,
        body: await buildProjectDetail(deps.db, {
          organizationId: actor.organizationId,
          projectId: input.projectId,
          now: input.now,
        }),
      };
    },

    async getProjectDetail(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const detail = await buildProjectDetail(deps.db, {
        organizationId: actor.organizationId,
        projectId: input.projectId,
        now: input.now,
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

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const updated = await updateProjectRecord(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        name: input.body.name,
        phase: input.body.phase,
        coverImageUrl: input.body.coverImageUrl,
        now: input.now,
      });
      if (!updated) {
        return { status: 404, body: { error: "project_not_found" } };
      }
      return {
        status: 200,
        body: { project: updated },
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      await deleteProjectRecord(deps.db, {
        organizationId: actor.organizationId,
        projectId,
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

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: sqlState.projectId,
        now: input.now,
      });
      if (result.idempotencyResult === "replayed") {
        const records = await listAssetReviewCandidatesForProject(deps.db, {
          organizationId: actor.organizationId,
          projectId: sqlState.projectId,
        });
        const assetCandidates = assetReviewStateFromRecords(records);
        const shots = await listShotsForProject(deps.db, {
          organizationId: actor.organizationId,
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
              organizationId: actor.organizationId,
              projectId: sqlState.projectId!,
              now: input.now,
              candidates: parsed.parse.candidateAssets.map((candidate) => ({
                group: candidate.kind,
                assetKey: candidate.id,
                label: candidate.name,
                required: candidate.kind !== "prop",
              })),
            });
            await replaceEpisodesForProject(deps.db, {
              organizationId: actor.organizationId,
              projectId: sqlState.projectId!,
              createdByUserId: actor.actorId,
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
                stableEpisodeUuid(sqlState.projectId!, episode.id),
              ]),
            );
            const shotEpisodeIdByIndex = new Map(
              parsed.parse.shots.map((shot, index) => [
                index,
                episodeIdBySourceId.get(shot.episodeId) ?? null,
              ]),
            );
            await replaceShotsForProject(deps.db, {
              organizationId: actor.organizationId,
              projectId: sqlState.projectId!,
              createdByUserId: actor.actorId,
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
        organizationId: actor.organizationId,
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
        const actor = await resolveActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const records = await confirmAllAssetReviewCandidateRecords(deps.db, {
          organizationId: actor.organizationId,
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
        const actor = await resolveActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const records = await confirmAssetReviewCandidateRecord(deps.db, {
          organizationId: actor.organizationId,
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
        const actor = await resolveActorContext(deps.db, {
          sessionToken: input.user.sessionToken,
          projectId: sqlState.projectId,
          now: new Date(),
        });
        const records = await updateAssetReviewCandidateRecordLabel(deps.db, {
          organizationId: actor.organizationId,
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      return {
        status: 200,
        body: {
          assets: await listAssetsForProject(deps.db, {
            organizationId: actor.organizationId,
            projectId,
          }),
        },
      };
    },

    async updateProjectAsset(input: {
      user: AuthenticatedCreatorUser;
      assetId: string;
      body: {
        name?: string | null;
        description?: string | null;
        isMain?: boolean | null;
      };
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const asset = await findProjectAssetById(deps.db, { assetId: input.assetId });
      if (!asset) {
        return { status: 404, body: { error: "asset_not_found" } };
      }
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: asset.projectId,
        now: input.now,
      });
      const updated = await updateProjectAssetRecord(deps.db, {
        organizationId: actor.organizationId,
        assetId: input.assetId,
        name: input.body.name,
        description: input.body.description,
        isMain: input.body.isMain,
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: asset.projectId,
        now: input.now,
      });
      const deleted = await deleteProjectAssetRecord(deps.db, {
        organizationId: actor.organizationId,
        assetId: input.assetId,
      });
      return deleted
        ? { status: 200, body: { deleted: true } }
        : { status: 404, body: { error: "asset_not_found" } };
    },

    async importAsset(input: {
      user: AuthenticatedCreatorUser;
      body: {
        kind: "character" | "scene" | "prop" | "image" | "video";
        name?: string | null;
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        workspaceId: deps.workspaceId,
        now: input.now,
      });
      const versions = await listAssetVersions(deps.db, {
        organizationId: actor.organizationId,
        assetId: input.assetId,
      });
      return { status: 200, body: { versions } };
    },

    async listProjectEpisodes(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const detail = await buildProjectDetail(deps.db, {
        organizationId: actor.organizationId,
        projectId: input.projectId,
        now: input.now,
      });
      return { status: 200, body: { episodes: detail.episodes } };
    },

    async listProjectMembers(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      return {
        status: 200,
        body: {
          members: await listProjectMembersForWorkspace(deps.db, {
            organizationId: actor.organizationId,
            workspaceId: actor.workspaceId,
          }),
        },
      };
    },

    async getProjectStats(input: {
      user: AuthenticatedCreatorUser;
      projectId: string;
      now: Date;
    }): Promise<CreatorHttpResponse<Record<string, unknown>>> {
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId: input.projectId,
        now: input.now,
      });
      const detail = await buildProjectDetail(deps.db, {
        organizationId: actor.organizationId,
        projectId: input.projectId,
        now: input.now,
      });
      return {
        status: 200,
        body: {
          stats: await buildProjectStats(deps.db, {
            organizationId: actor.organizationId,
            projectId: input.projectId,
            detail,
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const episode = await createEpisodeForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        title,
        createdByUserId: actor.actorId,
        now: input.now,
      });
      return { status: 200, body: { episode } };
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const episode = await updateEpisodeForProject(deps.db, {
        organizationId: actor.organizationId,
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const deleted = await deleteEpisodeForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        episodeId: input.body.episodeId,
      });
      return { status: deleted ? 200 : 404, body: deleted ? { deleted: true } : { error: "episode_not_found" } };
    },

    async createShot(input: {
      user: AuthenticatedCreatorUser;
      body: { title?: string | null; description?: string | null; episodeId?: string | null };
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const result = await creatorApp.createShot(input.body);
      await upsertShotsForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        createdByUserId: actor.actorId,
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const result = await creatorApp.updateShot(input.body);
      await upsertShotsForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        createdByUserId: actor.actorId,
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      await creatorApp.seedShotRecords(
        await listShotsForProject(deps.db, {
          organizationId: actor.organizationId,
          projectId,
        }),
      );
      const result = await creatorApp.deleteShot(input.body);
      await deps.db.query(
        `
          DELETE FROM calibration_items
          WHERE organization_id = $1
            AND shot_id = $2
        `,
        [actor.organizationId, input.body.shotId],
      );
      await deps.db.query(
        `
          DELETE FROM shot_reference_assets
          WHERE organization_id = $1
            AND project_id = $2
            AND shot_id = $3
        `,
        [actor.organizationId, projectId, input.body.shotId],
      );
      const deletedShotRows = await deps.db.query(
        `
          DELETE FROM shots
          WHERE organization_id = $1
            AND project_id = $2
            AND id = $3
          RETURNING id
        `,
        [actor.organizationId, projectId, input.body.shotId],
      );
      console.log("creator.deleteShot success", {
        projectId,
        shotId: input.body.shotId,
        remainingShots: Array.isArray(result.shots) ? result.shots.length : null,
        deletedRows: deletedShotRows.rows.length,
      });
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const result = await creatorApp.reorderShots(input.body);
      await upsertShotsForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        createdByUserId: actor.actorId,
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

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        organizationId: actor.organizationId,
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
            organizationId: actor.organizationId,
            projectId,
            createdByUserId: actor.actorId,
            shots: [resolvedShot],
            now: input.now,
          });
        }
      }
      if (!resolvedShot) {
        return { status: 404, body: { error: "shot_not_found" } };
      }
      const storageObjectKey = input.body.storageObjectKey?.trim();
      if (!storageObjectKey) {
        return { status: 400, body: { error: "storage_object_key_required" } };
      }

      const snapshot = await createAssetVersionSnapshot(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        assetType: input.body.kind === "video" ? "shot_video" : "shot_image",
        assetKey: input.body.shotId,
        createdByUserId: actor.actorId,
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
          sourceUrl: input.body.sourceUrl?.trim() || null,
          previewUrl:
            input.body.sourceUrl?.trim() ||
            (storageObjectKey.startsWith("data:") ? storageObjectKey : null),
        },
        sourceTaskId: randomUUID(),
        sourceAttemptId: randomUUID(),
        now: input.now,
      });

      const updated = await updateShotMediaPointer(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        shotId: input.body.shotId,
        kind: input.body.kind,
        assetVersionId: snapshot.version.id,
        now: input.now,
      });
      await updateProjectPhase(deps.db, projectId, "shot_generation");
      await creatorApp.seedShotRecords(
        await listShotsForProject(deps.db, {
          organizationId: actor.organizationId,
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

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        shotId: input.body.shotId,
      });
      if (!shot) {
        return { status: 404, body: { error: "shot_not_found" } };
      }

      const deleted = await deleteShotMediaVersionRecord(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        shotId: input.body.shotId,
        kind: input.body.kind,
        assetVersionId: input.body.assetVersionId,
        now: input.now,
      });
      if (!deleted) {
        return { status: 404, body: { error: "shot_media_not_found" } };
      }

      await creatorApp.seedShotRecords(
        await listShotsForProject(deps.db, {
          organizationId: actor.organizationId,
          projectId,
        }),
      );

      const refreshedShot = await findProjectShot(deps.db, {
        organizationId: actor.organizationId,
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
      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        shotId: input.body.shotId,
      });
      if (!shot) {
        return { status: 404, body: { error: "shot_not_found" } };
      }
      const references = await replaceShotReferencesForShot(deps.db, {
        organizationId: actor.organizationId,
        projectId,
        shotId: input.body.shotId,
        createdByUserId: actor.actorId,
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
          const actor = await resolveActorContext(deps.db, {
            sessionToken: input.user.sessionToken,
            projectId,
            now: input.now,
          });
          await replaceCalibrationSessionForProject(deps.db, {
            organizationId: actor.organizationId,
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
          const actor = await resolveActorContext(deps.db, {
            sessionToken: input.user.sessionToken,
            projectId,
            now: input.now,
          });
          await replaceCalibrationSessionForProject(deps.db, {
            organizationId: actor.organizationId,
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
          const actor = await resolveActorContext(deps.db, {
            sessionToken: input.user.sessionToken,
            projectId,
            now: input.now,
          });
          await replaceCalibrationSessionForProject(deps.db, {
            organizationId: actor.organizationId,
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

    async generateImages(input: {
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
        const actor = await resolveActorContext(deps.db, {
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
                  version: success.version,
                  now: input.now,
                });
              }
              await upsertShotsForProject(deps.db, {
                organizationId: actor.organizationId,
                projectId,
                createdByUserId: actor.actorId,
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

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        organizationId: actor.organizationId,
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
        organizationId: actor.organizationId,
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
          organizationId: actor.organizationId,
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
          organizationId: actor.organizationId,
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
              version: success.version,
              now: input.now,
            });
          }
          await upsertShotsForProject(deps.db, {
            organizationId: actor.organizationId,
            projectId,
            createdByUserId: actor.actorId,
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
        const actor = await resolveActorContext(deps.db, {
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
                  version: result.version,
                  now: input.now,
                });
              }
              await upsertShotsForProject(deps.db, {
                organizationId: actor.organizationId,
                projectId,
                createdByUserId: actor.actorId,
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

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const shot = await findProjectShot(deps.db, {
        organizationId: actor.organizationId,
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
        organizationId: actor.organizationId,
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
          organizationId: actor.organizationId,
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
          organizationId: actor.organizationId,
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
              version: result.version,
              now: input.now,
            });
          }
          await upsertShotsForProject(deps.db, {
            organizationId: actor.organizationId,
            projectId,
            createdByUserId: actor.actorId,
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
          version: result.version,
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
        const actor = await resolveActorContext(deps.db, {
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
              organizationId: actor.organizationId,
              workspaceId: actor.workspaceId!,
              projectId,
              workflowId: platform.workflowId,
              storageObjectId: platform.storageObjectId,
              manifestStatus: exportPreview.export.status,
              allowPartialExport: exportPreview.export.allowPartialExport,
              itemCount: exportPreview.export.items.length,
              missingAssetCount: exportPreview.export.missingAssets.length,
              latestSignedUrlExpiresAt: platform.expiresAt,
              createdByUserId: actor.actorId,
              now: input.now,
            });
            await updateProjectPhase(deps.db, projectId, "export");
          },
        });
        await aggregateWorkflowStatus(deps.db, platform.workflowId);
        const exportRecord = (
          await listExportRecordsForProject(deps.db, {
            organizationId: actor.organizationId,
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

      const actor = await resolveActorContext(deps.db, {
        sessionToken: input.user.sessionToken,
        projectId,
        now: input.now,
      });
      const records = await listExportRecordsForProject(deps.db, {
        organizationId: actor.organizationId,
        projectId,
      });

      return {
        status: 200,
        body: {
          records,
        },
      };
    },
  };
}

async function releaseImageRetryClaimIfSafe(
  db: SqlDatabase,
  input: {
    organizationId: string;
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
    organizationId: string;
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

    const actor = await resolveActorContext(db, {
      sessionToken: input.sessionToken,
      projectId: input.projectId,
      capability: input.capability,
      now: input.now,
    });
    const store = new SqlIdempotencyRecordStore(db);
    const started = await beginOrReplayCommand(store, {
      organizationId: actor.organizationId,
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
  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    now: input.now,
  });

  return appendAuditEvent(db, {
    organizationId: actor.organizationId,
    workspaceId: actor.workspaceId,
    projectId: input.projectId,
    actorUserId: actor.actorId,
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

async function listProjectsForWorkspace(
  db: SqlDatabase,
  input: { organizationId: string; workspaceId: string },
) {
  const result = await db.query<{
    id: string;
    name: string;
    cover_image_url: string | null;
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
        aspect_ratio,
        resolution,
        phase,
        created_by_user_id,
        created_at,
        updated_at
      FROM projects
      WHERE organization_id = $1
        AND workspace_id = $2
      ORDER BY created_at DESC, id DESC
    `,
    [input.organizationId, input.workspaceId],
  );

  return result.rows.map((project) => ({
    id: project.id,
    name: project.name,
    coverImageUrl: project.cover_image_url,
    aspectRatio: project.aspect_ratio,
    resolution: project.resolution,
    phase: project.phase,
    createdByUserId: project.created_by_user_id,
    createdAt: new Date(project.created_at),
    updatedAt: new Date(project.updated_at),
  }));
}

async function listProjectMembersForWorkspace(
  db: SqlDatabase,
  input: { organizationId: string; workspaceId: string },
) {
  const result = await db.query<{
    membership_id: string;
    user_id: string;
    phone_e164: string;
    role: string;
    status: string;
    created_at: Date | string;
  }>(
    `
      SELECT
        m.id AS membership_id,
        m.user_id,
        u.phone_e164,
        m.role,
        m.status,
        m.created_at
      FROM memberships m
      JOIN users u
        ON u.id = m.user_id
      WHERE m.organization_id = $1
        AND m.workspace_id = $2
      ORDER BY m.created_at ASC, m.id ASC
    `,
    [input.organizationId, input.workspaceId],
  );

  return result.rows.map((row) => ({
    id: row.membership_id,
    userId: row.user_id,
    phone: row.phone_e164,
    role: row.role,
    status: row.status,
    joinedAt: new Date(row.created_at),
  }));
}

async function updateProjectRecord(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    name?: string | null;
    phase?: "script_input" | "asset_review" | "shot_generation" | "export" | null;
    coverImageUrl?: string | null;
    now: Date;
  },
) {
  const current = (
    await db.query<{
      id: string;
      name: string;
      cover_image_url: string | null;
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
        WHERE organization_id = $1
          AND id = $2
      `,
      [input.organizationId, input.projectId],
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
        SET name = $3,
            phase = $4,
            cover_image_url = $5,
            updated_at = $6
        WHERE organization_id = $1
          AND id = $2
        RETURNING *
      `,
      [
        input.organizationId,
        input.projectId,
        name,
        input.phase ?? current.phase,
        input.coverImageUrl === undefined ? current.cover_image_url : input.coverImageUrl,
        input.now,
      ],
    )
  ).rows[0]!;

  return {
    id: row.id,
    name: row.name,
    coverImageUrl: row.cover_image_url,
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
    organization_id: string;
    project_id: string;
    asset_type: string;
    asset_key: string;
  }>(
    `
      SELECT id, organization_id, project_id, asset_type, asset_key
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
    organizationId: row.organization_id,
    projectId: row.project_id,
    assetType: row.asset_type,
    assetKey: row.asset_key,
  };
}

async function updateProjectAssetRecord(
  db: SqlDatabase,
  input: {
    organizationId: string;
    assetId: string;
    name?: string | null;
    description?: string | null;
    isMain?: boolean | null;
    now: Date;
  },
) {
  const latestVersion = (
    await db.query<{
      id: string;
      metadata_json: Record<string, unknown> | null;
    }>(
      `
        SELECT id, metadata_json
        FROM asset_versions
        WHERE organization_id = $1
          AND asset_id = $2
        ORDER BY version_number DESC
        LIMIT 1
      `,
      [input.organizationId, input.assetId],
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

  await db.query(
    `
      UPDATE asset_versions
      SET metadata_json = $3
      WHERE organization_id = $1
        AND id = $2
    `,
    [input.organizationId, latestVersion.id, metadata],
  );
  await db.query(
    `
      UPDATE assets
      SET updated_at = $3
      WHERE organization_id = $1
        AND id = $2
    `,
    [input.organizationId, input.assetId, input.now],
  );

  return latestVersion.id;
}

async function deleteShotMediaVersionRecord(
  db: SqlDatabase,
  input: {
    organizationId: string;
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
    }>(
      `
        SELECT v.asset_id, v.id AS version_id
        FROM asset_versions v
        JOIN assets a
          ON a.organization_id = v.organization_id
         AND a.id = v.asset_id
        WHERE v.organization_id = $1
          AND a.project_id = $2
          AND a.asset_key = $3
          AND a.asset_type = $4
          AND v.id = $5
        LIMIT 1
      `,
      [input.organizationId, input.projectId, input.shotId, assetType, input.assetVersionId],
    )
  ).rows[0];
  if (!versionRow) {
    const assetVersionRows = (
      await db.query<{
        asset_id: string;
        version_id: string;
      }>(
        `
          SELECT a.id AS asset_id, v.id AS version_id
          FROM assets a
          JOIN asset_versions v
            ON v.organization_id = a.organization_id
           AND v.asset_id = a.id
          WHERE a.organization_id = $1
            AND a.project_id = $2
            AND a.asset_key = $3
            AND a.asset_type = $4
            AND a.id = $5
          ORDER BY v.version_number DESC, v.created_at DESC
          LIMIT 2
        `,
        [
          input.organizationId,
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
      }>(
        `
          SELECT a.id AS asset_id, v.id AS version_id
          FROM shots s
          JOIN asset_versions v
            ON v.organization_id = s.organization_id
           AND v.id = s.${currentVersionColumn}
          JOIN assets a
            ON a.organization_id = v.organization_id
           AND a.id = v.asset_id
          WHERE s.organization_id = $1
            AND s.project_id = $2
            AND s.id = $3
            AND a.project_id = $2
            AND a.asset_type = $4
            AND (
              v.id = $5
              OR a.id = $5
              OR s.${currentVersionColumn} = $5
            )
          LIMIT 1
        `,
        [input.organizationId, input.projectId, input.shotId, assetType, input.assetVersionId],
      )
    ).rows[0];
  }
  if (!versionRow) {
    const candidateRows = (
      await db.query<{
        asset_id: string;
        version_id: string;
      }>(
        `
          SELECT a.id AS asset_id, v.id AS version_id
          FROM assets a
          JOIN asset_versions v
            ON v.organization_id = a.organization_id
           AND v.asset_id = a.id
          WHERE a.organization_id = $1
            AND a.project_id = $2
            AND a.asset_key = $3
            AND a.asset_type = $4
          ORDER BY v.version_number DESC, v.created_at DESC
          LIMIT 2
        `,
        [input.organizationId, input.projectId, input.shotId, assetType],
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
        WHERE organization_id = $1
          AND asset_id = $2
          AND id <> $3
        ORDER BY version_number DESC, created_at DESC
      `,
      [input.organizationId, versionRow.asset_id, resolvedVersionId],
    )
  ).rows;
  const nextVersionId = remainingVersions[0]?.id ?? null;

  if (input.kind === "video") {
    await db.query(
      `
        UPDATE shots
        SET current_video_asset_version_id =
              CASE
                WHEN current_video_asset_version_id = $4 THEN $5
                ELSE current_video_asset_version_id
              END,
            video_status =
              CASE
                WHEN current_video_asset_version_id = $4 AND $5 IS NULL THEN 'not_ready'
                ELSE video_status
              END,
            updated_at = $6
        WHERE organization_id = $1
          AND project_id = $2
          AND id = $3
      `,
      [input.organizationId, input.projectId, input.shotId, resolvedVersionId, nextVersionId, input.now],
    );
  } else {
    await db.query(
      `
        UPDATE shots
        SET current_image_asset_version_id =
              CASE
                WHEN current_image_asset_version_id = $4 THEN $5
                ELSE current_image_asset_version_id
              END,
            image_status =
              CASE
                WHEN current_image_asset_version_id = $4 AND $5 IS NULL THEN 'ready'
                ELSE image_status
              END,
            updated_at = $6
        WHERE organization_id = $1
          AND project_id = $2
          AND id = $3
      `,
      [input.organizationId, input.projectId, input.shotId, resolvedVersionId, nextVersionId, input.now],
    );
  }

  await db.query(
    `
      DELETE FROM asset_versions
      WHERE organization_id = $1
        AND id = $2
    `,
    [input.organizationId, resolvedVersionId],
  );

  if (!remainingVersions.length) {
    await db.query(
      `
        DELETE FROM assets
        WHERE organization_id = $1
          AND id = $2
      `,
      [input.organizationId, versionRow.asset_id],
    );
  }

  return true;
}

async function deleteProjectAssetRecord(
  db: SqlDatabase,
  input: {
    organizationId: string;
    assetId: string;
  },
) {
  const existing = await findProjectAssetById(db, { assetId: input.assetId });
  if (!existing || existing.organizationId !== input.organizationId) {
    return false;
  }
  await db.query(
    `
      DELETE FROM shot_reference_assets
      WHERE organization_id = $1
        AND asset_id = $2
    `,
    [input.organizationId, input.assetId],
  );
  await db.query(
    `
      DELETE FROM asset_versions
      WHERE organization_id = $1
        AND asset_id = $2
    `,
    [input.organizationId, input.assetId],
  );
  await db.query(
    `
      DELETE FROM assets
      WHERE organization_id = $1
        AND id = $2
    `,
    [input.organizationId, input.assetId],
  );
  return true;
}

async function buildProjectStats(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    detail: Awaited<ReturnType<typeof buildProjectDetail>>;
    now: Date;
  },
) {
  const membersResult = await db.query<{ count: number | string }>(
    `
      SELECT COUNT(*) AS count
      FROM memberships m
      JOIN projects p
        ON p.organization_id = m.organization_id
       AND p.workspace_id = m.workspace_id
      WHERE p.organization_id = $1
        AND p.id = $2
    `,
    [input.organizationId, input.projectId],
  );

  const stats = {
    memberCount: Number(membersResult.rows[0]?.count ?? 0),
    episodeCount: input.detail.episodes.length,
    shotCount: input.detail.shots.length,
    assetCount:
      input.detail.assetsByType.character.length +
      input.detail.assetsByType.scene.length +
      input.detail.assetsByType.prop.length +
      input.detail.assetsByType.other.image.length +
      input.detail.assetsByType.other.video.length,
    exportCount: input.detail.exportHistory.length,
    generatedImageCount: input.detail.shots.filter((shot) => shot.imageStatus === "ready").length,
    generatedVideoCount: input.detail.shots.filter((shot) => shot.videoStatus === "ready").length,
    lastActivityAt:
      input.detail.project?.updatedAt ??
      input.detail.exportHistory[0]?.createdAt ??
      input.now,
  };

  return stats;
}

async function deleteProjectRecord(
  db: SqlDatabase,
  input: { organizationId: string; projectId: string },
) {
  await db.query("DELETE FROM provider_requests WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query(
    `
      DELETE FROM task_attempts
      WHERE task_id IN (
        SELECT id FROM tasks WHERE organization_id = $1 AND project_id = $2
      )
    `,
    [input.organizationId, input.projectId],
  );
  await db.query("DELETE FROM tasks WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM workflows WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM export_records WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM storage_objects WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query(
    `
      DELETE FROM asset_versions
      WHERE organization_id = $1
        AND asset_id IN (
          SELECT id FROM assets WHERE organization_id = $1 AND project_id = $2
        )
    `,
    [input.organizationId, input.projectId],
  );
  await db.query("DELETE FROM assets WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query(
    `
      DELETE FROM calibration_items
      WHERE organization_id = $1
        AND calibration_session_id IN (
          SELECT id FROM calibration_sessions WHERE organization_id = $1 AND project_id = $2
        )
    `,
    [input.organizationId, input.projectId],
  );
  await db.query("DELETE FROM calibration_sessions WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM asset_review_candidates WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM shots WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM episodes WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM scripts WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM audit_events WHERE organization_id = $1 AND project_id = $2", [
    input.organizationId,
    input.projectId,
  ]);
  await db.query("DELETE FROM projects WHERE organization_id = $1 AND id = $2", [
    input.organizationId,
    input.projectId,
  ]);
}

async function buildProjectDetail(
  db: SqlDatabase,
  input: {
    organizationId: string;
    projectId: string;
    now: Date;
  },
) {
  const projectBundle = await loadProjectBundleFromSql(db, {
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

  const assets = await listAssetsForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  const assetVersions = await listAssetVersionsForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  const references = await listShotReferencesForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  const shots = await listShotsForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  const episodes = await listEpisodesForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });
  const exportHistory = await listExportRecordsForProject(db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
  });

  const assetsByType = groupAssetsByUiType(assets);
  const versionsByShotId = groupShotAssetVersionsByShotId(assetVersions);
  const referencesByShotId = groupReferencesByShotId(references);
  const projectEpisodes = episodes.length
    ? episodes
    : shots.length
      ? [
          {
            id: "episode-primary",
            organizationId: input.organizationId,
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

  return {
    project: projectBundle.project,
    script: projectBundle.script,
    assetSummary: buildAssetSummary(assetsByType),
    assetsByType,
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
        previewUrl: findEpisodePreviewUrl(episodeShots, assets),
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
      previewImageUrl: findVersionPreviewUrl(assetVersions, shot.currentImageAssetVersionId),
      previewVideoUrl: findVersionPreviewUrl(assetVersions, shot.currentVideoAssetVersionId),
      imageVersions: versionsByShotId.get(shot.id)?.image ?? [],
      videoVersions: versionsByShotId.get(shot.id)?.video ?? [],
      references: referencesByShotId.get(shot.id) ?? [],
    })),
    exportHistory,
  };
}

async function listAssetsForProject(
  db: SqlDatabase,
  input: { organizationId: string; projectId: string },
) {
  const result = await db.query<{
    id: string;
    asset_type: string;
    asset_key: string;
    created_at: Date | string;
    updated_at: Date | string;
    version_id: string | null;
    version_number: number | string | null;
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
        v.storage_object_key,
        v.metadata_json,
        v.created_at AS version_created_at
      FROM assets a
      LEFT JOIN LATERAL (
        SELECT *
        FROM asset_versions
        WHERE organization_id = a.organization_id
          AND asset_id = a.id
        ORDER BY version_number DESC
        LIMIT 1
      ) v ON true
      WHERE a.organization_id = $1
        AND a.project_id = $2
      ORDER BY a.updated_at DESC, a.id DESC
    `,
    [input.organizationId, input.projectId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    assetType: row.asset_type,
    assetKey: row.asset_key,
    label: row.metadata_json?.label ?? row.asset_key,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    previewUrl: getAssetPreviewUrl(row.storage_object_key, row.metadata_json),
    latestVersion: row.version_id
      ? {
          id: row.version_id,
          versionNumber: Number(row.version_number),
          storageObjectKey: row.storage_object_key,
          metadata: row.metadata_json,
          previewUrl: getAssetPreviewUrl(row.storage_object_key, row.metadata_json),
          createdAt: row.version_created_at ? new Date(row.version_created_at) : null,
        }
      : null,
  }));
}

type ListedAsset = Awaited<ReturnType<typeof listAssetsForProject>>[number];

async function listAssetVersionsForProject(
  db: SqlDatabase,
  input: { organizationId: string; projectId: string },
) {
  const result = await db.query<{
    asset_id: string;
    asset_type: string;
    asset_key: string;
    version_id: string;
    version_number: number | string;
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
        v.storage_object_key,
        v.metadata_json,
        v.source_task_id,
        v.source_attempt_id,
        v.created_at
      FROM assets a
      JOIN asset_versions v
        ON v.organization_id = a.organization_id
       AND v.asset_id = a.id
      WHERE a.organization_id = $1
        AND a.project_id = $2
      ORDER BY a.asset_key ASC, v.version_number DESC
    `,
    [input.organizationId, input.projectId],
  );

  return result.rows.map((row) => ({
    assetId: row.asset_id,
    assetType: row.asset_type,
    assetKey: row.asset_key,
    id: row.version_id,
    versionNumber: Number(row.version_number),
    storageObjectKey: row.storage_object_key,
    metadata: row.metadata_json ?? {},
    sourceTaskId: row.source_task_id,
    sourceAttemptId: row.source_attempt_id,
    previewUrl: getAssetPreviewUrl(row.storage_object_key, row.metadata_json ?? {}),
    createdAt: new Date(row.created_at),
  }));
}

type ListedAssetVersion = Awaited<ReturnType<typeof listAssetVersionsForProject>>[number];

function createEmptyAssetsByType() {
  return {
    character: [] as ListedAsset[],
    scene: [] as ListedAsset[],
    prop: [] as ListedAsset[],
    other: {
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
      grouped.other.video.push(asset);
    } else {
      grouped.other.image.push(asset);
    }
  }
  return grouped;
}

function buildAssetSummary(assetsByType: ReturnType<typeof createEmptyAssetsByType>) {
  return {
    character: summarizeAssets(assetsByType.character),
    scene: summarizeAssets(assetsByType.scene),
    prop: summarizeAssets(assetsByType.prop),
    other: summarizeAssets([...assetsByType.other.image, ...assetsByType.other.video]),
  };
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

function findVersionPreviewUrl(
  versions: ListedAssetVersion[],
  assetVersionId: string | null,
) {
  if (!assetVersionId) {
    return null;
  }
  return versions.find((version) => version.id === assetVersionId)?.previewUrl ?? null;
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

async function listAssetVersions(
  db: SqlDatabase,
  input: { organizationId: string; assetId: string },
) {
  const result = await db.query<{
    id: string;
    version_number: number | string;
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
        storage_object_key,
        metadata_json,
        source_task_id,
        source_attempt_id,
        created_at
      FROM asset_versions
      WHERE organization_id = $1
        AND asset_id = $2
      ORDER BY version_number DESC
    `,
    [input.organizationId, input.assetId],
  );

  return result.rows.map((row) => ({
    id: row.id,
    versionNumber: Number(row.version_number),
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
    organizationId: string;
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
      organization_id: string;
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
          SET current_image_asset_version_id = $4,
              image_status = 'completed',
              video_status = 'ready',
              current_video_asset_version_id = NULL,
              active_image_task_id = NULL,
              active_image_revision = NULL,
              active_video_task_id = NULL,
              active_video_image_asset_version_id = NULL,
              updated_at = $5
          WHERE organization_id = $1
            AND project_id = $2
            AND id = $3
          RETURNING *
        `
        : `
          UPDATE shots
          SET current_video_asset_version_id = $4,
              video_status = 'completed',
              active_video_task_id = NULL,
              active_video_image_asset_version_id = NULL,
              updated_at = $5
          WHERE organization_id = $1
            AND project_id = $2
            AND id = $3
          RETURNING *
        `,
      [
        input.organizationId,
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
    organizationId: row.organization_id,
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
    organizationId: string;
    projectId: string;
    shotId: string;
  },
): Promise<ShotRecord | undefined> {
  const shots = await listShotsForProject(db, {
    organizationId: input.organizationId,
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
  const actor = await resolveActorContext(db, {
    sessionToken: input.sessionToken,
    projectId: input.projectId,
    now: input.now,
  });
  const records = await listAssetReviewCandidatesForProject(db, {
    organizationId: actor.organizationId,
    projectId: input.projectId,
  });
  const projectBundle = await loadProjectBundleFromSql(db, {
    projectId: input.projectId,
    scriptId: input.scriptId,
  });
  const shots = await listShotsForProject(db, {
    organizationId: actor.organizationId,
    projectId: input.projectId,
  });
  const calibration = await getLatestCalibrationSessionForProject(db, {
    organizationId: actor.organizationId,
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
    organization_id: string;
    workspace_id: string;
    name: string;
    cover_image_url: string | null;
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
    organization_id: string;
    project_id: string;
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
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    [input.projectId, input.scriptId],
  );
  const script = scriptResult.rows[0];

  return {
    project: {
      id: project.id,
      organizationId: project.organization_id,
      workspaceId: project.workspace_id,
      name: project.name,
      coverImageUrl: project.cover_image_url,
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
          organizationId: script.organization_id,
          projectId: script.project_id,
          status: script.status,
          inputText: script.input_text,
          createdByUserId: script.created_by_user_id,
          createdAt: new Date(script.created_at),
          updatedAt: new Date(script.updated_at),
        }
      : null,
  };
}

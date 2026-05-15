import { randomUUID } from "node:crypto";

import {
  computeAssetReviewSummary,
  confirmAssetCandidate,
  createAssetReviewState,
  type AssetReviewState,
} from "./asset-review.service.ts";
import { InMemoryAssetStore } from "./asset.service.ts";
import {
  createCalibrationSession,
  markCalibrationItemReviewed,
  passCalibrationSession,
  type CalibrationSessionRecord,
} from "./calibration.service.ts";
import { buildExportManifest, type ExportManifest } from "./export-manifest.service.ts";
import { createDeterministicMockParseResult } from "./parse-script.service.ts";
import {
  createProjectDraft,
  InMemoryProjectStore,
  type ProjectBundle,
} from "./project.service.ts";
import {
  finalizeShotImageGenerationBatch,
  startShotImageGenerationBatch,
} from "./shot-image-generation.service.ts";
import { createShotDraft, InMemoryShotStore } from "./shot.service.ts";
import {
  finalizeShotVideoGeneration,
  startShotVideoGeneration,
} from "./shot-video-generation.service.ts";

interface CreatorShotView {
  id: string;
  title: string;
  contentRevision: number;
  imageStatus: string;
  videoStatus: string;
  currentImageAssetVersionId: string | null;
  currentVideoAssetVersionId: string | null;
}

export interface CreatorDevStateSnapshot {
  project: ProjectBundle["project"] | null;
  script: ProjectBundle["script"] | null;
  assetReview: ReturnType<typeof computeAssetReviewSummary> | null;
  calibration: CalibrationSessionRecord | null;
  shots: CreatorShotView[];
  exportPreview: ExportManifest | null;
}

export class CreatorDevApp {
  private readonly projectStore = new InMemoryProjectStore();
  private readonly assetStore = new InMemoryAssetStore();
  private readonly shotStore = new InMemoryShotStore();
  private activeBundle: ProjectBundle | null = null;
  private activeAssetReview: AssetReviewState | null = null;
  private activeCalibration: CalibrationSessionRecord | null = null;
  private shotIds: string[] = [];
  private exportPreview: ExportManifest | null = null;
  private requestCounter = 0;

  async createProject(input: {
    name: string;
    scriptInput: string;
    aspectRatio: string;
    resolution: string;
  }) {
    this.requestCounter += 1;
    const created = await createProjectDraft(this.projectStore, {
      organizationId: "dev-org",
      workspaceId: "dev-workspace",
      createdByUserId: "dev-user",
      name: input.name,
      scriptInput: input.scriptInput,
      aspectRatio: input.aspectRatio,
      resolution: input.resolution,
      idempotencyKey: `creator-dev-create-${this.requestCounter}`,
    });

    this.activeBundle = {
      project: created.project,
      script: created.script,
    };
    this.activeAssetReview = null;
    this.activeCalibration = null;
    this.shotIds = [];
    this.exportPreview = null;

    return created;
  }

  async parseScript() {
    const bundle = this.requireBundle();
    const parsed = createDeterministicMockParseResult(bundle.script.inputText);

    this.shotIds = [];
    for (const shot of parsed.shots) {
      const created = await createShotDraft(this.shotStore, {
        organizationId: bundle.project.organizationId,
        projectId: bundle.project.id,
        title: `Shot ${String(shot.sequence).padStart(3, "0")}`,
        createdByUserId: bundle.project.createdByUserId,
      });
      this.shotIds.push(created.id);
    }

    this.activeAssetReview = createAssetReviewState({
      characters: parsed.candidateAssets
        .filter((candidate) => candidate.kind === "character")
        .map((candidate) => ({
          assetKey: candidate.id,
          label: candidate.name,
          required: true,
        })),
      scenes: parsed.candidateAssets
        .filter((candidate) => candidate.kind === "scene")
        .map((candidate) => ({
          assetKey: candidate.id,
          label: candidate.name,
          required: true,
        })),
      props: parsed.candidateAssets
        .filter((candidate) => candidate.kind === "prop")
        .map((candidate) => ({
          assetKey: candidate.id,
          label: candidate.name,
          required: false,
        })),
    });

    this.exportPreview = null;

    return {
      parse: parsed,
      assetReview: computeAssetReviewSummary(this.activeAssetReview),
      shots: await this.listShots(),
    };
  }

  confirmAllAssets() {
    const review = this.requireAssetReview();
    let next = review;

    for (const candidate of review.characters) {
      next = confirmAssetCandidate(next, {
        group: "character",
        assetKey: candidate.assetKey,
      });
    }
    for (const candidate of review.scenes) {
      next = confirmAssetCandidate(next, {
        group: "scene",
        assetKey: candidate.assetKey,
      });
    }
    for (const candidate of review.props) {
      next = confirmAssetCandidate(next, {
        group: "prop",
        assetKey: candidate.assetKey,
      });
    }

    this.activeAssetReview = next;
    return { assetReview: computeAssetReviewSummary(next) };
  }

  async runCalibration() {
    const shots = await this.listShots();
    let calibration = createCalibrationSession({
      organizationId: "dev-org",
      projectId: this.requireBundle().project.id,
      shotIds: shots.slice(0, 3).map((shot) => shot.id),
      createdByUserId: "dev-user",
    });

    for (const item of calibration.items) {
      calibration = markCalibrationItemReviewed(calibration, {
        shotId: item.shotId,
        qualityReviewResult: "passed",
      });
    }

    calibration = passCalibrationSession(calibration, {
      decidedByUserId: "dev-user",
    });

    this.activeCalibration = calibration;
    return { calibration };
  }

  async generateImages() {
    const shots = await this.listShots();
    const started = await startShotImageGenerationBatch(this.shotStore, {
      calibration: this.requireCalibration(),
      requests: shots.map((shot, index) => ({
        shotId: shot.id,
        taskId: `image-task-${index + 1}`,
      })),
    });

    const results = await finalizeShotImageGenerationBatch(this.assetStore, this.shotStore, {
      organizationId: "dev-org",
      projectId: this.requireBundle().project.id,
      createdByUserId: "dev-user",
      results: started.map((shot, index) => ({
        shotId: shot.id,
        taskId: `image-task-${index + 1}`,
        requestedContentRevision: shot.activeImageRevision ?? 1,
        status: "succeeded" as const,
        storageObjectKey: `generated/${shot.id}.png`,
        metadata: {
          mimeType: "image/png",
          width: 720,
          height: 1280,
        },
        sourceAttemptId: randomUUID(),
      })),
    });

    this.exportPreview = null;
    return {
      ...results,
      shots: await this.listShots(),
    };
  }

  async generateVideos() {
    const shots = await this.listShots();
    const started = [];

    for (let index = 0; index < shots.length; index += 1) {
      started.push(
        await startShotVideoGeneration(this.shotStore, {
          shotId: shots[index]!.id,
          taskId: `video-task-${index + 1}`,
        }),
      );
    }

    const results = [];
    for (let index = 0; index < started.length; index += 1) {
      results.push(
        await finalizeShotVideoGeneration(this.assetStore, this.shotStore, {
          organizationId: "dev-org",
          projectId: this.requireBundle().project.id,
          createdByUserId: "dev-user",
          shotId: started[index]!.id,
          taskId: `video-task-${index + 1}`,
          requestedImageAssetVersionId: started[index]!.currentImageAssetVersionId ?? "",
          status: "succeeded",
          storageObjectKey: `generated/${started[index]!.id}.mp4`,
          metadata: {
            mimeType: "video/mp4",
            width: 720,
            height: 1280,
          },
          sourceAttemptId: randomUUID(),
        }),
      );
    }

    return {
      results,
      shots: await this.listShots(),
    };
  }

  async previewExport() {
    this.exportPreview = buildExportManifest({
      projectId: this.requireBundle().project.id,
      shots: (await this.listShots()).map((shot) => ({
        shotId: shot.id,
        title: shot.title,
        currentImageAssetVersionId: shot.currentImageAssetVersionId,
      })),
    });

    return { export: this.exportPreview };
  }

  async getState(): Promise<CreatorDevStateSnapshot> {
    return {
      project: this.activeBundle?.project ?? null,
      script: this.activeBundle?.script ?? null,
      assetReview: this.activeAssetReview
        ? computeAssetReviewSummary(this.activeAssetReview)
        : null,
      calibration: this.activeCalibration,
      shots: await this.listShots(),
      exportPreview: this.exportPreview,
    };
  }

  private async listShots(): Promise<CreatorShotView[]> {
    const shots: CreatorShotView[] = [];
    for (const shotId of this.shotIds) {
      const shot = await this.shotStore.findShot(shotId);
      if (!shot) {
        continue;
      }

      shots.push({
        id: shot.id,
        title: shot.title,
        contentRevision: shot.contentRevision,
        imageStatus: shot.imageStatus,
        videoStatus: shot.videoStatus,
        currentImageAssetVersionId: shot.currentImageAssetVersionId,
        currentVideoAssetVersionId: shot.currentVideoAssetVersionId,
      });
    }
    return shots;
  }

  private requireBundle() {
    if (!this.activeBundle) {
      throw new Error("creator_project_missing");
    }
    return this.activeBundle;
  }

  private requireAssetReview() {
    if (!this.activeAssetReview) {
      throw new Error("creator_asset_review_missing");
    }
    return this.activeAssetReview;
  }

  private requireCalibration() {
    if (!this.activeCalibration) {
      throw new Error("creator_calibration_missing");
    }
    return this.activeCalibration;
  }
}

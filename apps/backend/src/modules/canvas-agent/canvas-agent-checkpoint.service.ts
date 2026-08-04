import type { SqlDatabase } from "../shared/db/sql.ts";
import { updateCanvasAgentStep } from "./canvas-agent-task.service.ts";
import type { CanvasAgentActor } from "./canvas-agent.types.ts";

export interface CanvasAgentCanvasRevisionGateway {
  readRevision(input: { canvasId: string; actor: CanvasAgentActor }): Promise<number>;
  createCheckpointRevision?(input: { canvasId: string; actor: CanvasAgentActor; now: Date }): Promise<number>;
  restoreRevision(input: {
    canvasId: string;
    actor: CanvasAgentActor;
    checkpointRevision: number;
    expectedRevision: number;
    reason: string;
  }): Promise<{ revision: number }>;
}

export class CanvasAgentCheckpointService {
  constructor(
    private readonly deps: {
      db: SqlDatabase;
      canvas: CanvasAgentCanvasRevisionGateway;
    },
  ) {}

  async create(input: {
    taskId: string;
    stepId: string;
    canvasId: string;
    actor: CanvasAgentActor;
    now: Date;
  }) {
    const revision = this.deps.canvas.createCheckpointRevision
      ? await this.deps.canvas.createCheckpointRevision({
          canvasId: input.canvasId,
          actor: input.actor,
          now: input.now,
        })
      : await this.deps.canvas.readRevision({
          canvasId: input.canvasId,
          actor: input.actor,
        });
    const checkpoint = {
      canvasId: input.canvasId,
      revision,
      createdAt: input.now.toISOString(),
    };
    await updateCanvasAgentStep(this.deps.db, {
      stepId: input.stepId,
      status: "running",
      checkpoint,
      now: input.now,
    });
    return checkpoint;
  }

  async rewind(input: {
    taskId: string;
    stepId: string;
    canvasId: string;
    actor: CanvasAgentActor;
    checkpointRevision: number;
    now: Date;
  }) {
    const expectedRevision = await this.deps.canvas.readRevision({
      canvasId: input.canvasId,
      actor: input.actor,
    });
    const restored = await this.deps.canvas.restoreRevision({
      canvasId: input.canvasId,
      actor: input.actor,
      checkpointRevision: input.checkpointRevision,
      expectedRevision,
      reason: `canvas-agent:${input.taskId}:${input.stepId}`,
    });
    await updateCanvasAgentStep(this.deps.db, {
      stepId: input.stepId,
      status: "succeeded",
      checkpoint: {
        checkpointRevision: input.checkpointRevision,
        expectedRevision,
        revisionAfter: restored.revision,
        compensation: true,
      },
      outputSummary: `compensation_revision:${restored.revision}`,
      now: input.now,
    });
    return restored;
  }
}

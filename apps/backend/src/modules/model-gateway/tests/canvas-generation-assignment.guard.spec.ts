import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { UploadSessionRuntime } from "../../storage/upload-session.service.ts";
import { createWorkflowWithTasks } from "../../workflow-task/workflow-task.service.ts";
import {
  assertCanvasGenerationAssignmentActive,
  CanvasGenerationAssignmentRevokedError,
} from "../canvas-generation-assignment.guard.ts";
import { finalizeGptImageArtifactJob, processGptImageSubmitJob } from "../gpt-image.worker.ts";

describe("Canvas generation assignment guard", { concurrency: false }, () => {
  it("validates owners and members while ignoring non-Canvas generation", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedFixture(db);
    try {
      await assertCanvasGenerationAssignmentActive(db, {
        canvasProjectId: fixture.canvasId,
        teamMemberId: fixture.memberId,
      });
      await assertCanvasGenerationAssignmentActive(db, { canvasProjectId: fixture.canvasId });
      await assertCanvasGenerationAssignmentActive(db, { teamMemberId: fixture.memberId });

      await db.query("DELETE FROM team_member_canvases WHERE member_id = $1 AND canvas_id = $2", [
        fixture.memberId,
        fixture.canvasId,
      ]);
      await assert.rejects(
        assertCanvasGenerationAssignmentActive(db, {
          canvasProjectId: fixture.canvasId,
          teamMemberId: fixture.memberId,
        }),
        (error: unknown) => error instanceof CanvasGenerationAssignmentRevokedError,
      );

      await db.query("UPDATE users SET status = 'disabled' WHERE id = $1", [fixture.userId]);
      await assert.rejects(
        assertCanvasGenerationAssignmentActive(db, { canvasProjectId: fixture.canvasId }),
        (error: unknown) => error instanceof CanvasGenerationAssignmentRevokedError,
      );
    } finally {
      await db.close();
    }
  });

  it("fails before provider submit and refunds existing member credits after assignment revocation", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedFixture(db);
    let providerCalls = 0;
    try {
      await db.query("UPDATE team_members SET member_credits = 23 WHERE id = $1", [fixture.memberId]);
      const workflow = await createWorkflowWithTasks(db, {
        userId: fixture.userId,
        projectId: null,
        canvasProjectId: fixture.canvasId,
        workflowType: "episode_image_generation",
        inputSnapshot: {},
        tasks: [{
          taskType: "episode_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "canvas",
          targetEntityId: fixture.canvasId,
          inputSnapshot: {
            providerExecutor: "gpt-image-2",
            canvasProjectId: fixture.canvasId,
            teamMemberId: fixture.memberId,
            targetType: "canvas",
            targetId: "image-node",
            prompt: "must never reach provider",
            model: "gpt-image-2-cn",
            parameters: {},
            cost: 77,
          },
        }],
      });
      const taskId = workflow.tasks[0]!.id;
      await db.query("DELETE FROM team_member_canvases WHERE member_id = $1 AND canvas_id = $2", [
        fixture.memberId,
        fixture.canvasId,
      ]);

      const result = await processGptImageSubmitJob(db, {
        taskId,
        runtime: {} as UploadSessionRuntime,
        env: { GPT_IMAGE2_API_KEY: "unused" },
        fetchImpl: (async () => {
          providerCalls += 1;
          throw new Error("provider must not be called");
        }) as typeof fetch,
        now: new Date("2026-07-25T06:00:00.000Z"),
      });
      const task = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM tasks WHERE id = $1",
        [taskId],
      );
      const member = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [fixture.memberId],
      );

      assert.deepEqual(result, { status: "failed", failureCode: "canvas_assignment_revoked" });
      assert.equal(providerCalls, 0);
      assert.deepEqual(task.rows[0], { status: "failed", failure_code: "canvas_assignment_revoked" });
      assert.equal(Number(member.rows[0]?.member_credits), 100);
    } finally {
      await db.close();
    }
  });

  it("blocks Artifact persistence and refunds after assignment is revoked post-submit", async () => {
    const db = await createMigratedTestDb();
    const fixture = await seedFixture(db);
    let uploadCalls = 0;
    const runtime = {
      adapter: {
        putObject: async () => {
          uploadCalls += 1;
          return { eTag: "must-not-upload" };
        },
      },
    } as unknown as UploadSessionRuntime;
    const fetchImpl = (async () => new Response(JSON.stringify({
      created: 1_717_200_000,
      data: [{ b64_json: Buffer.from("canvas artifact").toString("base64") }],
    }), { status: 200, headers: { "content-type": "application/json" } })) as typeof fetch;
    try {
      const workflow = await createWorkflowWithTasks(db, {
        userId: fixture.userId,
        projectId: null,
        canvasProjectId: fixture.canvasId,
        workflowType: "episode_image_generation",
        inputSnapshot: {},
        tasks: [{
          taskType: "episode_generate_image",
          queueName: "generation-submit-image",
          targetEntityType: "canvas",
          targetEntityId: fixture.canvasId,
          inputSnapshot: {
            providerExecutor: "gpt-image-2",
            canvasProjectId: fixture.canvasId,
            teamMemberId: fixture.memberId,
            targetType: "canvas",
            targetId: "image-node",
            prompt: "submitted before revocation",
            model: "gpt-image-2-cn",
            parameters: { responseFormat: "b64_json" },
            cost: 20,
          },
        }],
      });
      const taskId = workflow.tasks[0]!.id;
      // The HTTP intake reserves member credits before the Provider worker starts.
      await db.query("UPDATE team_members SET member_credits = 80 WHERE id = $1", [fixture.memberId]);
      const submitted = await processGptImageSubmitJob(db, {
        taskId,
        runtime,
        env: { GPT_IMAGE2_API_KEY: "test-key" },
        fetchImpl,
        now: new Date("2026-07-25T07:00:00.000Z"),
      });
      const balanceAfterSubmit = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [fixture.memberId],
      );
      assert.equal(Number(balanceAfterSubmit.rows[0]?.member_credits), 80);
      await db.query("DELETE FROM team_member_canvases WHERE member_id = $1 AND canvas_id = $2", [
        fixture.memberId,
        fixture.canvasId,
      ]);

      const finalized = await finalizeGptImageArtifactJob(db, {
        taskId,
        runtime,
        env: { GPT_IMAGE2_API_KEY: "test-key" },
        fetchImpl,
        now: new Date("2026-07-25T07:01:00.000Z"),
      });
      const member = await db.query<{ member_credits: number | string }>(
        "SELECT member_credits FROM team_members WHERE id = $1",
        [fixture.memberId],
      );

      assert.deepEqual(submitted, { status: "submitted", providerStatus: "succeeded" });
      assert.deepEqual(finalized, { status: "failed", failureCode: "canvas_assignment_revoked" });
      assert.equal(uploadCalls, 0);
      assert.equal(Number(member.rows[0]?.member_credits), 100);
    } finally {
      await db.close();
    }
  });
});

async function seedFixture(db: Awaited<ReturnType<typeof createMigratedTestDb>>) {
  const userId = randomUUID();
  const memberId = randomUUID();
  const canvasId = randomUUID();
  await db.query("INSERT INTO users (id, status) VALUES ($1, 'active')", [userId]);
  await db.query(
    `
      INSERT INTO team_members (
        id, user_id, member_account, member_account_suffix, member_login_account,
        member_name, member_password_hash, member_credits, status
      ) VALUES ($1, $2, 'guard-member', 'uguard', 'guard-member@uguard',
                'Guard Member', 'hash', 100, 'active')
    `,
    [memberId, userId],
  );
  await db.query(
    `
      INSERT INTO creator_canvas_projects
        (id, title, status, server_revision, created_by_user_id, updated_by_user_id)
      VALUES ($1, 'Guard Canvas', 'active', 1, $2, $2)
    `,
    [canvasId, userId],
  );
  await db.query(
    "INSERT INTO team_member_canvases (id, member_id, user_id, canvas_id) VALUES ($1, $2, $3, $4)",
    [randomUUID(), memberId, userId, canvasId],
  );
  return { userId, memberId, canvasId };
}

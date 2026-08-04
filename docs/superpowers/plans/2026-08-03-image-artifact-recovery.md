# Image Artifact Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep provider-succeeded image tasks recoverable for at most six hours without showing a false terminal failure or resubmitting generation.

**Architecture:** A pure image recovery policy owns retry timing and permanent-error classification. The image worker persists recovery state in the existing generation snapshot JSON, while the maintenance loop schedules only due retries. Task center projects the bounded recovery metadata from PostgreSQL and adjusts only recovery-task refresh timing.

**Tech Stack:** TypeScript, Node test runner, PostgreSQL JSONB, BullMQ, browser JavaScript.

---

### Task 1: Add the pure six-hour recovery policy

**Files:**
- Create: `apps/backend/src/modules/model-gateway/gpt-image-artifact-recovery.policy.ts`
- Create: `apps/backend/src/modules/model-gateway/tests/gpt-image.artifact-recovery.policy.spec.ts`

- [ ] **Step 1: Write failing schedule and classification tests**

```ts
assert.deepEqual(planGptImageArtifactRecovery({ now, previous: null, failure }), {
  action: "retry",
  round: 1,
  nextRetryAt: new Date(now.getTime() + 2 * 60_000),
  deadlineAt: new Date(now.getTime() + 6 * 60 * 60_000),
});
assert.equal(classifyGptImageArtifactRecoveryFailure({ httpStatus: 404 }).kind, "permanent");
assert.equal(classifyGptImageArtifactRecoveryFailure({ httpStatus: 503 }).kind, "transient");
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test -- apps/backend/src/modules/model-gateway/tests/gpt-image.artifact-recovery.policy.spec.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the fixed retry table, six-hour deadline, state parser and permanent-error classifier**

```ts
const retryDelaysMs = [2 * minute, 5 * minute, 15 * minute, 30 * minute, hour, 2 * hour, 2 * hour];

export function planGptImageArtifactRecovery(input: RecoveryInput): RecoveryDecision {
  const previous = parseGptImageArtifactRecoveryState(input.previous);
  const startedAt = previous?.startedAt ?? input.now;
  const deadlineAt = previous?.deadlineAt ?? new Date(startedAt.getTime() + 6 * hour);
  const round = (previous?.round ?? 0) + 1;
  if (classifyGptImageArtifactRecoveryFailure(input.failure).kind === "permanent") {
    return { action: "manual_review", reason: "permanent_failure", round, startedAt, deadlineAt };
  }
  const delayMs = retryDelaysMs[round - 1];
  if (!delayMs || input.now >= deadlineAt || input.now.getTime() + delayMs >= deadlineAt.getTime()) {
    return { action: "manual_review", reason: "recovery_exhausted", round, startedAt, deadlineAt };
  }
  return { action: "retry", round, startedAt, nextRetryAt: new Date(input.now.getTime() + delayMs), deadlineAt };
}
```

- [ ] **Step 4: Run the policy tests and verify GREEN**

Run: `npm test -- apps/backend/src/modules/model-gateway/tests/gpt-image.artifact-recovery.policy.spec.ts`

Expected: all policy tests pass.

### Task 2: Persist recovery state when an image finalize wave exhausts

**Files:**
- Create: `apps/backend/src/modules/model-gateway/gpt-image-artifact-recovery.service.ts`
- Modify: `apps/backend/src/modules/model-gateway/gpt-image.artifact-finalizer.ts`
- Modify: `apps/backend/src/modules/model-gateway/gpt-image.worker.ts`
- Modify: `scripts/run-generation-video-worker.mjs`
- Test: `apps/backend/src/modules/model-gateway/tests/generation-artifact-recovery.spec.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/gpt-image.artifact-finalizer.spec.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/generation-video-worker.launcher.spec.ts`

- [ ] **Step 1: Write failing tests for transient exhaustion, permanent exhaustion and late-failure fencing**

```ts
assert.equal(await handleGptImageArtifactQueueExhaustion(db, transientInput), "retry_pending");
assert.match(taskUpdateSql, /status = 'running'/);
assert.match(snapshotUpdateSql, /asset_transfer_retry_pending/);

assert.equal(await handleGptImageArtifactQueueExhaustion(db, permanentInput), "manual_review_required");
assert.match(snapshotUpdateSql, /asset_transfer_manual_review/);

assert.equal(await handleGptImageArtifactQueueExhaustion(succeededDb, transientInput), "skipped");
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- apps/backend/src/modules/model-gateway/tests/generation-artifact-recovery.spec.ts apps/backend/src/modules/model-gateway/tests/gpt-image.artifact-finalizer.spec.ts apps/backend/src/modules/model-gateway/tests/generation-video-worker.launcher.spec.ts`

Expected: FAIL because the exhaustion service and structured HTTP metadata are missing.

- [ ] **Step 3: Add structured HTTP/MIME/size failures and reject a missing provider artifact**

```ts
throw Object.assign(new Error(`provider_artifact_download_${response.status}`), {
  failureCode: "provider_output_download_failed",
  httpStatus: response.status,
});
```

Set the image cap to 64 MiB, require `image/` content when it is not `application/octet-stream`, and return `provider_output_missing` when a provider-succeeded image has no URL/base64 artifact.

- [ ] **Step 4: Implement conditional task/attempt/snapshot updates**

The service must update only non-success image tasks. Retry decisions keep task and attempt `running`, clear worker leases, preserve active credits, clear stale failure timestamps, and merge `artifactRecovery` into `provider_status_json`. Manual decisions set `provider_output_storage_failed`, `asset_transfer_manual_review`, `admin_action_required`, and keep credits for review.

- [ ] **Step 5: Route only exhausted image artifact jobs through the new service**

```js
if (artifactQueueFailure && job?.data?.mediaType === "image") {
  const outcome = await handleGptImageArtifactQueueExhaustion(db, { taskId, error, now: failedAt });
  if (outcome !== "skipped") return;
}
```

Video and audio continue through `failGenerationTaskAfterQueueError` unchanged.

- [ ] **Step 6: Run the focused tests and verify GREEN**

Run the command from Step 2. Expected: all focused tests pass.

### Task 3: Schedule only due image finalize recovery waves

**Files:**
- Modify: `apps/backend/src/modules/model-gateway/generation-redis-repair.service.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/generation-artifact-recovery.spec.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/generation-redis-repair.spec.ts`

- [ ] **Step 1: Write failing pure/mocked tests for due, not-due, expired and legacy candidates**

```ts
assert.equal(isGptImageArtifactRecoveryDue(retryState, beforeNextRetry), false);
assert.equal(isGptImageArtifactRecoveryDue(retryState, atNextRetry), true);
assert.equal(isGptImageArtifactRecoveryExpired(retryState, atDeadline), true);
```

The SQL/mocked test must prove that image candidates read only `provider_status_json->'artifactRecovery'`, exclude `state = manual_review`, and keep video candidate behavior unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `npm test -- apps/backend/src/modules/model-gateway/tests/generation-artifact-recovery.spec.ts`

Expected: FAIL because due-state filtering is absent.

- [ ] **Step 3: Gate image enqueueing by persisted schedule and deadline**

For image candidates, missing recovery state is an immediate legacy/lost-outbox recovery. A `retry_pending` candidate is dispatched only when `nextRetryAt <= now < deadlineAt`. Expired candidates are moved to image storage manual review without creating another outbox event. Other media follow existing logic without the new gate.

- [ ] **Step 4: Preserve database claim and outbox deduplication**

Keep the existing active-outbox exclusion, `last_dispatched_at` cutoff and row lock. Reopen only legacy image queue/storage failures to `running`; never reopen a succeeded or canceled task.

- [ ] **Step 5: Run the focused non-database test and syntax checks**

Run: `npm test -- apps/backend/src/modules/model-gateway/tests/generation-artifact-recovery.spec.ts`

Run: `node --check scripts/run-generation-video-worker.mjs`

Expected: both pass.

### Task 4: Project recovery metadata through the local task center

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify: `apps/web/src/features/production-workbench/project-detail.js`
- Test: `apps/web/tests/task-center.spec.mjs`

- [ ] **Step 1: Write failing task-center projection and refresh tests**

```js
assert.equal(resolveTaskCenterPollDelayForTest(startedAt, false, now, [recoveryTask]), 120_000);
assert.match(html, /供应商已完成，平台正在保存图片/);
assert.match(html, /第 3 轮/);
assert.match(html, /最晚恢复时间/);
```

- [ ] **Step 2: Run the frontend test and verify RED**

Run: `npm test -- apps/web/tests/task-center.spec.mjs`

Expected: FAIL because recovery metadata is not projected or rendered.

- [ ] **Step 3: Add bounded task-center fields**

The SQL selects only `snapshot.provider_status_json->'artifactRecovery'` and computes whether the latest provider request succeeded. The response returns `providerSucceeded`, `recoveryRound`, `recoveryStartedAt`, `nextRetryAt`, `recoveryDeadlineAt`, and `lastFailureCode`.

- [ ] **Step 4: Align recovery-only polling and render recovery details**

Normal active tasks retain 15/30/60-second polling. When every active task is waiting for asset recovery, schedule the nearest `nextRetryAt` with a 15-second minimum and five-minute maximum. Manual refresh and immediate scheduling remain zero-delay.

- [ ] **Step 5: Run task-center tests and verify GREEN**

Run: `npm test -- apps/web/tests/task-center.spec.mjs`

Expected: all task-center tests pass.

### Task 5: Verify and review the complete image-only diff

**Files:**
- Review all files changed by Tasks 1-4.

- [ ] **Step 1: Run all non-database image recovery regressions**

Run: `npm test -- apps/backend/src/modules/model-gateway/tests/gpt-image.artifact-recovery.policy.spec.ts apps/backend/src/modules/model-gateway/tests/gpt-image.artifact-finalizer.spec.ts apps/backend/src/modules/model-gateway/tests/generation-artifact-recovery.spec.ts apps/backend/src/modules/model-gateway/tests/generation-video-worker.launcher.spec.ts apps/backend/src/modules/model-gateway/tests/bananarouter.provider-adapter.spec.ts apps/web/tests/task-center.spec.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 2: Retry the database integration regression using the formal project DATABASE_URL**

Run: `node --env-file="D:/project/code/comic_ai_fork/comic_ai/.env" scripts/run-tests.mjs apps/backend/src/modules/model-gateway/tests/generation-redis-repair.spec.ts`

Expected: pass. If schema migration again exceeds five minutes, report it as unverified rather than passed.

- [ ] **Step 3: Run syntax and diff checks**

Run: `node --check scripts/run-generation-video-worker.mjs`

Run: `git diff --check`

Expected: both exit successfully.

- [ ] **Step 4: Run gstack pre-landing review and fix every confirmed issue**

Review the full diff against `origin/main`, with special attention to status monotonicity, duplicate outbox creation, credit reservation transitions, JSON size, and video behavior drift.

- [ ] **Step 5: Commit only the image recovery files**

```bash
git add docs/superpowers/specs/2026-08-03-image-artifact-recovery-design.md \
  docs/superpowers/plans/2026-08-03-image-artifact-recovery.md \
  apps/backend/src/modules/model-gateway/gpt-image-artifact-recovery.policy.ts \
  apps/backend/src/modules/model-gateway/gpt-image-artifact-recovery.service.ts \
  apps/backend/src/modules/model-gateway/gpt-image.artifact-finalizer.ts \
  apps/backend/src/modules/model-gateway/gpt-image.worker.ts \
  apps/backend/src/modules/model-gateway/generation-redis-repair.service.ts \
  apps/backend/src/entrypoints/phone-auth-dev-server.ts \
  apps/web/src/features/production-workbench/index.js \
  apps/web/src/features/production-workbench/project-detail.js \
  scripts/run-generation-video-worker.mjs \
  apps/backend/src/modules/model-gateway/tests/gpt-image.artifact-recovery.policy.spec.ts \
  apps/backend/src/modules/model-gateway/tests/gpt-image.artifact-finalizer.spec.ts \
  apps/backend/src/modules/model-gateway/tests/generation-artifact-recovery.spec.ts \
  apps/backend/src/modules/model-gateway/tests/generation-video-worker.launcher.spec.ts \
  apps/web/tests/task-center.spec.mjs
git commit -m "fix: bound image artifact recovery"
```

Expected: one focused commit; no video behavior changes and no files from the original dirty worktree.


# 2026-07-15 generation queue backlog investigation

## Symptom

Admin overview shows 356 queued tasks and repeats 37 queued / 177 failed for each visible image model.

## Root cause hypothesis

The dashboard model-health query counts PostgreSQL `tasks` by shared `queue_name`, then attaches that same queue aggregate to every model using the queue. The overview also sums `queueDepth` across model rows, so shared queues are counted once per model. This is a reporting error, not a Redis queue depth.

Separately, PostgreSQL contains stale queued image tasks that are not represented by current BullMQ jobs. The database queue state and Redis queue state have diverged.

## Evidence

- `apps/backend/src/modules/admin-dashboard/admin-dashboard.service.ts:175-194` counts tasks by `queue_name` and joins the result to every model dispatch policy.
- Current PostgreSQL counts: `generation-submit-image` has 37 queued/running and 177 terminal failures; `generation-submit-video` has 5 queued, 78 failed, and 4 result-unknown.
- 20 model rows contain 8 image models and 12 video models. The displayed total is `8 * 37 + 12 * 5 = 356`.
- Current Redis/BullMQ inspection from `.env` reports zero waiting, delayed, and active jobs on all configured generation queues. Redis responds `PONG`.
- Of the 37 queued image tasks, 31 have no `generation.task.created` outbox event and 6 have a processed event but remain queued. The oldest queued records date back to June 2026.
- Image failure breakdown is heterogeneous (`provider_failed` 66, `task_timeout` 32, `cumob_image_failed` 23, and other provider/configuration failures), so the 177 value is a historical terminal-failure count, not current queue pressure.

## Fix

- `apps/admin/index.html` now de-duplicates shared queue metrics in the dashboard summary.
- The model table shows queue depth and failure count once per shared queue and labels subsequent model rows as `共享`.
- Added a UI regression test in `apps/admin/index.test.mjs` covering shared image/video queues.
- Historical queued image tasks were not automatically replayed; they need a separate reconciliation decision before any provider call or credit action.
- The timeout maintenance scheduler was explicitly disabled by `.env` (`STORAGE_REPAIR_SCHEDULER_ENABLED=false`). The timeout repair code therefore did not run periodically; the 37 queued image tasks had expired `timeoutAt` values but remained untouched.
- `.env` was changed to enable the scheduler. A storage `headObject` failure was then found to abort the combined repair cycle before generation timeout cleanup. `runCreatorRepairMaintenance` now executes generation timeout cleanup even when storage repair fails, while preserving the storage error for logging/API behavior.

## Evidence

- `npm run test:admin:ui`: 92 passed, 0 failed.
- Targeted timeout repair tests: 2 passed, 0 failed.
- After restart and one scheduler cycle, 65 expired tasks were marked `failed/task_timeout` (49 image, 16 video); no expired open generation tasks remain.
- 13 reservations released 3005 credits. One pre-existing `manual_review_required` reservation for 180 credits remains for manual settlement.

## Status

DONE_WITH_CONCERNS: dashboard overcounting and timeout scheduler execution are fixed and verified. One pre-existing manual-review reservation remains intentionally outside automatic release.

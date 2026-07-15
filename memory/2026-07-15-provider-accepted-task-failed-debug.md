# 2026-07-15 provider accepted task failed debug report

## Symptom

A video provider accepted a generation request and kept rendering, while the local task immediately became `failed/provider_submission_failed` and no poll job was queued.

## Root cause

`processSeedanceVideoSubmitJob` called the undefined runtime helper `readSubmittedRedactedRequest` after `submitProviderRequest` had already persisted the provider request as `accepted`. The resulting `ReferenceError` entered the broad submission catch, which incorrectly failed the task, released credits, and returned `skipped`.

## Fix

- Restored `readSubmittedRedactedRequest`.
- Added an accepted-submission guard. A provider request with an external request ID and status `accepted`, `running`, or `succeeded` remains running and returns `already_started`, allowing the BullMQ handler to enqueue provider polling.
- Added regression coverage for the normal accepted path and for a local request-log failure after provider acceptance.

## Related audit

The only production `submitProviderRequest` call sites are the Seedance video worker and GPT Image worker. The undefined helper existed only in the video worker. The image worker and provider adapters passed their existing success-path suites.

## Evidence

- Seedance worker: 14 passed.
- BullMQ worker handlers: 14 passed.
- Provider request lifecycle/no-blind-retry/crash recovery: 7 passed.
- GPT Image worker: 16 passed.
- GlobalAiOpc and Seedance provider adapters: 18 passed.
- Fresh accepted-path regression rerun: 2 passed.
- Development stack restarted; HTTP port 4310 returned 200 and generation worker was running.

## Historical tasks

Three existing tasks matched `failed/provider_submission_failed` while their provider request had an external ID and remained accepted. Their credit reservations were already released, so they were intentionally not mutated or automatically resumed.

## Status

DONE_WITH_CONCERNS: new submissions are fixed. The three historical tasks require an explicit billing/reconciliation decision before recovery.

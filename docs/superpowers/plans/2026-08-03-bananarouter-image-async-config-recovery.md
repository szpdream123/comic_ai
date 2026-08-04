# BananaRouter Image Async Config Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make new and existing model configurations round-trip without transport drift, and complete BananaRouter GPT Image 2's documented asynchronous generation and edit recovery contract without changing the original synchronous paths.

**Architecture:** Keep the existing generic generation worker, durable provider request, task snapshot, and poll queue. Repair common admin configuration preservation and launch validation for every model, while keeping BananaRouter endpoint and response details inside its provider adapter. Activate no live model configuration as part of the code change.

**Tech Stack:** TypeScript, Node test runner, PostgreSQL-backed admin model service, static admin shell JavaScript, CSS.

**Execution status (2026-08-03):** Tasks 1-6 are implemented and the task-focused adapter, admin UI, admin HTTP, migration, runtime-safe, and layout checks pass. The broader workbench test file still has 15 pre-existing failures outside this diff; the new layout regression test passes independently.

---

### Task 1: Complete the BananaRouter async image contract

**Files:**
- Modify: `apps/backend/src/modules/model-gateway/bananarouter.provider-adapter.ts`
- Modify: `apps/backend/src/modules/model-gateway/provider-adapter.factory.ts`
- Test: `apps/backend/src/modules/model-gateway/tests/bananarouter.provider-adapter.spec.ts`

- [ ] Add a failing poll test for the documented `status: "success"` plus top-level `resultImages[].url` response.
- [ ] Add a failing submission test proving reference edits use `/v1/images/edits/async`, send `Idempotency-Key`, and return a provider task ID.
- [ ] Add a failing validation test proving async generation and async edit endpoints are both accepted while mismatched endpoints are rejected.
- [ ] Extend image artifact parsing to accept `resultImages[]` without removing existing `data[]`, `result`, `response`, or `output` handling.
- [ ] Recognize both documented async image endpoint paths in submission/recovery and provider validation.
- [ ] Run `npm test -- apps/backend/src/modules/model-gateway/tests/bananarouter.provider-adapter.spec.ts` and require all tests to pass.

### Task 2: Preserve transport configuration for all new and existing models

**Files:**
- Modify: `apps/admin/index.html`
- Test: `apps/admin/index.test.mjs`

- [ ] Add failing source-contract tests proving existing sync and async models retain `invocationMode`, capabilities, provider configuration, and dispatch policy when the adapter is unchanged.
- [ ] Add a failing source-contract test proving a new BananaRouter image model starts with the documented async generation/edit/query endpoints and image poll queue.
- [ ] Change the simplified editor serializer to use fixed defaults only for new models or an intentional adapter change, and otherwise preserve hidden transport fields from the existing model.
- [ ] Keep all non-BananaRouter image templates synchronous.
- [ ] Run `npm run test:admin:ui` and require all tests to pass.

### Task 3: Add common async launch invariants

**Files:**
- Modify: `apps/backend/src/modules/admin-models/admin-model-config.service.ts`
- Test: `apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`

- [ ] Add a failing HTTP test proving draft diagnostics report an `async_polling` model without a poll queue.
- [ ] Add the poll queue requirement to draft diagnostics and model health checks while preserving the existing non-blocking status-change contract.
- [ ] Keep existing query endpoint validation and provider-specific validation intact.
- [ ] Run the focused admin platform HTTP test through `scripts/run-tests.mjs`.

### Task 4: Converge the existing BananaRouter image model configuration

**Files:**
- Create: `packages/db/migrations/20260828-bananarouter-image-async-config-convergence.sql`
- Modify: `apps/backend/src/modules/shared/db/migrations.ts`
- Modify: `scripts/migrate-user-scope.mjs`
- Test: `apps/backend/src/modules/shared/db/tests/generation-migration-registration.spec.ts`

- [ ] Add failing registration and migration tests for an existing mixed sync-mode/async-endpoint configuration.
- [ ] Save a normalized synchronous rollback snapshot before changing the current model configuration.
- [ ] Converge only `bananarouter-gpt-image-2` to documented async generation, edit, query, capability, result, and poll queue values.
- [ ] Register the forward migration in application and production manifests without editing the applied historical migration.
- [ ] Apply the migration twice in the test and require one rollback snapshot and an idempotent final configuration.

### Task 5: Fix the model option layout

**Files:**
- Modify: `apps/web/src/features/production-workbench/production-workbench.css`
- Test: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] Add a failing CSS contract test requiring size-option buttons to wrap long labels and use a usable minimum column width.
- [ ] Update only the generation settings option grid and button text layout.
- [ ] Run `npm test -- apps/web/tests/project-workbench-generation.spec.ts` and require the focused suite to pass.

### Task 6: Regression verification and review

**Files:**
- Verify all files changed above.

- [ ] Run BananaRouter adapter and generation snapshot tests together.
- [ ] Run the complete admin UI suite.
- [ ] Run focused admin HTTP integration coverage.
- [ ] Run the focused workbench generation suite.
- [ ] Run repository type/static checks that cover the changed modules.
- [ ] Run `git diff --check` and confirm the worktree contains only task-related changes.
- [ ] Run the gstack pre-landing review and resolve every actionable finding.

## Safety boundaries

- Do not delete, rewrite, or automatically bypass the synchronous generation and edit paths.
- Do not automatically fall back from an ambiguous async submission to a synchronous submission.
- Do not resubmit historical `result_unknown` tasks.
- Do not change API keys, pricing, parameter values, or any model other than `bananarouter-gpt-image-2` in the convergence migration.
- Do not edit the already-applied historical async recovery migration.

## Deployment order

1. Deploy the adapter and worker code that recognizes `/v1/images/edits/async` and `resultImages`.
2. Confirm every old image submit/poll worker has exited or been drained.
3. Run the full migration command explicitly; this convergence migration is intentionally excluded from the runtime-safe startup gate.
4. Verify the BananaRouter image model probe before enabling or resuming production traffic.

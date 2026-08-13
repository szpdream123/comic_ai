# AI Storyboard Parallel Asset Stages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run the scene, character, and prop AI storyboard stages concurrently while preserving the existing SSE event order, prompts, model calls, billing count, and final preview data.

**Architecture:** Keep the first selected asset stage as the live foreground async generator. Start the remaining selected asset stages immediately as background collectors, buffer their existing events, and replay those buffers in the original scene-character-prop order before starting the shot stage. Use the request abort signal for every stage and cancel unfinished collectors when the foreground or replay path fails.

**Tech Stack:** TypeScript, Node.js async generators, `node:test`, existing `TextChatGatewayLike` test doubles.

## Global Constraints

- Do not change models, prompts, temperature, response format, retry rules, credit counts, API contracts, or final data structures.
- Preserve the visible SSE stage order: `scene`, `character`, `prop`, `shot`.
- Preserve `selectedStages`, `skipScriptStage`, single-stage regeneration, cancellation, and error behavior.
- Do not modify frontend files or database schema.
- Do not stage or alter the existing uncommitted onboarding files.

---

### Task 1: Prove and implement concurrent asset-stage startup

**Files:**
- Modify: `apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.spec.ts`
- Modify: `apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.ts:124-245`

**Interfaces:**
- Consumes: `createAiStoryboardPreviewService({ gateway }).generatePreviewStream(input)`.
- Produces: the existing `AsyncIterable<AiStoryboardPreviewStreamEvent>` with unchanged event payloads and ordering.

- [x] **Step 1: Write the failing concurrency and ordering test**

Add a controlled `TextChatGatewayLike` whose scene, character, and prop calls each signal that they started and then wait on independent release promises. Start consuming `generatePreviewStream` with `skipScriptStage: true` and all four asset stages selected. Assert all three extraction calls start before any release, assert the shot call has not started, release the calls out of order, and finally assert received `asset_start`/`asset_done` stages remain `scene`, `character`, `prop`, `shot`.

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node scripts/run-tests.mjs apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.spec.ts -- --test-name-pattern "starts independent asset stages concurrently"
```

Expected: FAIL because the current service does not start `character` or `prop` until `scene` completes.

- [x] **Step 3: Add a background stage collector**

Add a private module helper that manually drains an `AsyncGenerator<AiStoryboardPreviewStreamEvent, string>` and returns both the yielded events and final raw string:

```ts
type CollectedAssetPromptStage = {
  events: AiStoryboardPreviewStreamEvent[];
  raw: string;
};

async function collectAssetPromptStage(
  stream: AsyncGenerator<AiStoryboardPreviewStreamEvent, string>,
): Promise<CollectedAssetPromptStage> {
  const events: AiStoryboardPreviewStreamEvent[] = [];
  let next = await stream.next();
  while (!next.done) {
    events.push(next.value);
    next = await stream.next();
  }
  return { events, raw: next.value };
}
```

Wrap collector promises immediately into fulfilled result objects so early failures cannot become unhandled promise rejections.

- [x] **Step 4: Replace only the scene-character-prop serial block**

Build the selected extraction stage definitions in fixed order. Start collectors for every selected stage after the first, stream the first stage with `yield*`, then replay each collected event and store its raw result. Leave `shot` generation and all parsing/normalization code after the extraction block unchanged.

- [x] **Step 5: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [x] **Step 6: Run the entire AI storyboard service test file**

```powershell
node scripts/run-tests.mjs apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.spec.ts
```

Expected: all tests pass with no new warnings.

### Task 2: Preserve subsets, failures, and cancellation

**Files:**
- Modify: `apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.spec.ts`
- Modify: `apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.ts:124-245`

**Interfaces:**
- Consumes: the Task 1 ordered parallel-stage runner.
- Produces: unchanged failure propagation and request cancellation behavior.

- [x] **Step 1: Write failing edge-behavior tests**

Add focused tests proving:

1. `selectedStages: ["character", "prop", "shot"]` starts only character and prop concurrently, preserves character-before-prop events, and waits for both before shot.
2. A rejected background asset stage prevents the shot call and prevents a `complete` event.
3. Aborting the request signal reaches every active extraction gateway call.

- [x] **Step 2: Run the new tests and verify RED where behavior is missing**

```powershell
node scripts/run-tests.mjs apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.spec.ts -- --test-name-pattern "parallel asset stages"
```

Expected: at least the background failure or sibling cancellation assertion fails before the minimal error/cancellation handling is added.

- [x] **Step 3: Add scoped cancellation and deterministic error propagation**

Create a local abort controller for parallel extraction stages, relay the request signal to it, pass its signal to all extraction stages, and remove the relay listener in `finally`. On a foreground or replayed background failure, abort unfinished siblings and throw the original stage error. Do not change the existing retry predicate inside `runAssetPromptStage`.

- [x] **Step 4: Run the edge tests and full service test file**

Run both commands from Tasks 1 and 2. Expected: all tests pass.

- [x] **Step 5: Run relevant backend HTTP tests and diff checks**

```powershell
node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts -- --test-name-pattern "AI storyboard preview|ai storyboard preview"
git diff --check
```

Expected: relevant HTTP tests pass and diff check reports no whitespace errors.

- [ ] **Step 6: Commit only the optimization files**

```powershell
git add -- apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.ts apps/backend/src/modules/ai-storyboard/ai-storyboard-preview.service.spec.ts docs/superpowers/plans/2026-08-13-ai-storyboard-parallel-asset-stages.md
git commit -m "perf(storyboard): parallelize independent asset stages"
```

Confirm the three pre-existing onboarding files remain unstaged.

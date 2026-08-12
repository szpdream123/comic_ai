# One-click Set Latest Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an “一键设置” action to both episode asset-image and storyboard-video scopes that applies each selected item's latest usable successful result or clears its current media.

**Architecture:** Extend the shared batch toolbar with one action and implement two scope-specific orchestrators in the existing production workbench controller. Each orchestrator force-loads persisted conversation history, resolves the newest usable non-failed result, reuses current persistence APIs, continues after per-item failures, and updates local UI state once the batch finishes.

**Tech Stack:** Vanilla JavaScript ES modules, Node test runner, existing creator API and episode workbench renderer.

---

### Task 1: Toolbar contract

**Files:**
- Modify: `apps/web/src/features/production-workbench/episode-workbench-rebuilt.js`
- Test: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write the failing rendering test**

Assert that `renderBatchSelectionActions("assets", ..., selectedCount)` and storyboard rendering include:

```html
<button class="episode-replica-stage-tab" type="button" data-action="set-selected-latest-media">一键设置</button>
```

Assert it precedes the select-all button and is disabled when the selected count is zero.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node scripts/run-tests.mjs apps/web/tests/project-workbench-generation.spec.ts -- --test-name-pattern "one-click set"
```

Expected: FAIL because `set-selected-latest-media` is absent.

- [ ] **Step 3: Implement the minimal toolbar change**

Pass selected count into `renderBatchSelectionActions` and render the new button before select-all:

```js
<button class="episode-replica-stage-tab" type="button" data-action="set-selected-latest-media" ${disabled(selectedCount === 0)}>一键设置</button>
```

- [ ] **Step 4: Extend selection-only DOM synchronization**

In `syncEpisodeWorkbenchBatchSelectionOnly`, set the action button's `disabled` and `aria-disabled` state from `selectedStoryboardIds.size` so optimized storyboard selection does not require a full render.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: PASS.

### Task 2: Latest-result resolver and asset-image batch action

**Files:**
- Modify: `apps/web/src/features/production-workbench/index.js`
- Test: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write failing asset-scope behavior tests**

Create selected assets with ordered conversation entries containing an older usable image and a newer failed entry. Assert the action calls `setFixedImage` with the older successful image. Add a second asset with no usable success and assert `clearFixedImage` is called.

- [ ] **Step 2: Run tests and verify RED**

Run the focused command from Task 1. Expected: FAIL because the action has no handler.

- [ ] **Step 3: Implement reusable latest-result resolution**

Add a helper equivalent to:

```js
function resolveLatestUsableConversationResult(entries, mediaKind) {
  return [...entries].reverse().find((entry) =>
    !isGenerationFailureStatus(resolveWorkflowStatus(entry?.status ?? entry?.workflowStatus)) &&
    Boolean(mediaKind === "video" ? resolveUsableVideo(entry) : resolveUsableImage(entry))
  ) ?? null;
}
```

Reuse existing media URL normalizers and failure status conventions rather than adding a second status model.

- [ ] **Step 4: Implement asset batch application**

For each `selectedEpisodeAssetIds` item, call `loadSelectedAssetConversationHistory(..., { force: true })`, resolve the latest usable image, and call `setFixedImage`; if none exists, call `clearFixedImage`. Synchronize local fixed-image state using `syncEpisodeAssetFixedImageState`.

- [ ] **Step 5: Continue after per-item failures and report counts**

Track `{ setCount, clearedCount, failedCount }`, continue processing after an exception, preserve selections, render once, and compose the aggregate toast.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run the focused command. Expected: PASS.

### Task 3: Storyboard-video batch action

**Files:**
- Modify: `apps/web/src/features/production-workbench/index.js`
- Test: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write failing storyboard-scope behavior tests**

Create selected storyboards with an older usable video and a newer failed entry. Assert the action binds the usable video. Add a storyboard with no usable success and assert `updateShot({ currentVideoAssetVersionId: null })` clears its current video.

- [ ] **Step 2: Run tests and verify RED**

Run the focused command. Expected: FAIL until storyboard scope is handled.

- [ ] **Step 3: Implement storyboard batch application**

For each `selectedStoryboardIds` item, force-load video history, resolve the latest usable video, and persist it through the existing storyboard video API. If none exists, clear the current video through `updateShot` and clear local preview state.

- [ ] **Step 4: Route the shared action by scope**

Handle `set-selected-latest-media` in the controller. Reject empty selections with the scope-appropriate message; otherwise run the asset or storyboard orchestrator under one busy state and one final render.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run the focused command. Expected: PASS.

### Task 4: Review and end-to-end verification

**Files:**
- Review all modified files.

- [ ] **Step 1: Run the production workbench test file**

```powershell
node scripts/run-tests.mjs apps/web/tests/project-workbench-generation.spec.ts
```

Expected: all tests pass.

- [ ] **Step 2: Run the full test suite**

```powershell
npm test
```

Expected: exit code 0 with no failing tests.

- [ ] **Step 3: Run the requested code review workflow**

Review `git diff` for correctness, race conditions, stale-history selection, error continuation, accessibility state, and unrelated changes. Fix Critical and Important findings, then rerun affected tests.

- [ ] **Step 4: Start the configured development server**

Read `.env` connection settings implicitly through the normal project startup command and run:

```powershell
npm run dev:background:start
```

Expected: the server reports a local creator URL without falling back to guessed service endpoints.

- [ ] **Step 5: Verify with gstack**

Open the creator URL, log in only through `/api/auth/password/login` if authentication is required, navigate to both modules, select items, run “一键设置”, and verify button placement, latest-success selection, empty clearing, toast summary, console errors, and network failures.

- [ ] **Step 6: Hand off the acceptance URL**

Keep the development server running and provide the exact local URL plus concise acceptance steps.

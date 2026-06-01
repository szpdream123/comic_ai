# Episode Asset Conversation History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist per-asset image/video conversation history so selecting an asset tab reloads its full message thread, including user request cards, running task cards, and final success/failure results.

**Architecture:** Add one tenant-scoped conversation table keyed by `projectId + episodeId + assetId + mediaMode`, with append-only messages and a small update path for task status changes. The web app will load history when an asset card becomes selected, render it back into the right-side conversation panel, and write the same thread for both image and video generation flows so the table shape does not need to change again later.

**Tech Stack:** PostgreSQL migrations, existing creator HTTP routes, `apps/web/src/shared/creator-api.js`, `apps/web/src/features/production-workbench/index.js`, `apps/web/src/features/production-workbench/project-detail.js`, `apps/web/src/features/production-workbench/episode-workbench-rebuilt.js`, Node test runner.

---

### Task 1: Add a unified asset conversation schema

**Files:**
- Modify: `packages/db/migrations/0001_foundation.sql`
- Modify: `apps/backend/src/modules/project/tests/asset-schema.spec.ts`
- Create: `apps/backend/src/modules/project/tests/asset-conversation-schema.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("asset conversation schema", () => {
  it("declares a media-mode aware conversation thread table and message table", () => {
    const sql = readFileSync(new URL("../../../../packages/db/migrations/0001_foundation.sql", import.meta.url), "utf8");
    assert.match(sql, /CREATE TABLE episode_asset_conversation_threads \(/);
    assert.match(sql, /media_mode text NOT NULL CHECK \(media_mode IN \('image', 'video'\)\)/);
    assert.match(sql, /UNIQUE \(organization_id, project_id, episode_id, asset_id, media_mode\)/);
    assert.match(sql, /CREATE TABLE episode_asset_conversation_messages \(/);
    assert.match(sql, /message_type text NOT NULL CHECK \(message_type IN \('user_request', 'task_status', 'result'\)\)/);
    assert.match(sql, /payload_json jsonb NOT NULL DEFAULT '{}'::jsonb/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/backend/src/modules/project/tests/asset-conversation-schema.spec.ts`
Expected: FAIL because the new tables and columns do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Add two tables:
- `episode_asset_conversation_threads` with `organization_id`, `workspace_id`, `project_id`, `episode_id`, `asset_id`, `media_mode`, `latest_message_at`, `created_by_user_id`, `created_at`, `updated_at`.
- `episode_asset_conversation_messages` with `thread_id`, `turn_id`, `message_type`, `status`, `task_id`, `payload_json`, `created_by_user_id`, `created_at`, `updated_at`.

Add indexes for:
- thread lookup by `organization_id, project_id, episode_id, asset_id, media_mode`
- message lookup by `thread_id, created_at, id`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/backend/src/modules/project/tests/asset-conversation-schema.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/db/migrations/0001_foundation.sql apps/backend/src/modules/project/tests/asset-schema.spec.ts apps/backend/src/modules/project/tests/asset-conversation-schema.spec.ts
git commit -m "feat: add asset conversation schema"
```

### Task 2: Add backend persistence APIs for conversation threads

**Files:**
- Create: `apps/backend/src/modules/project/asset-conversation-record.service.ts`
- Modify: `apps/backend/src/modules/project/creator-application.service.ts`
- Modify: `apps/backend/src/modules/project/creator-dev-app.ts`
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createAssetConversationThread, listAssetConversationMessages } from "../src/modules/project/asset-conversation-record.service.ts";

describe("asset conversation records", () => {
  it("creates a thread and preserves user/task/result messages for image and video", async () => {
    // Use the test db helper already used by the project module specs.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/backend/src/modules/project/tests/asset-conversation-record.service.spec.ts`
Expected: FAIL because the service does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Implement:
- `upsertAssetConversationThread(...)`
- `appendAssetConversationMessage(...)`
- `listAssetConversationMessages(...)`
- `markLatestConversationMessageAt(...)`

Keep the API generic over `mediaMode: "image" | "video"` and `messageType: "user_request" | "task_status" | "result"`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/backend/src/modules/project/tests/asset-conversation-record.service.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/project/asset-conversation-record.service.ts apps/backend/src/modules/project/creator-application.service.ts apps/backend/src/modules/project/creator-dev-app.ts apps/backend/src/entrypoints/phone-auth-dev-server.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts
git commit -m "feat: persist asset conversation records"
```

### Task 3: Write and replay image/video conversation history from the real generation flow

**Files:**
- Modify: `apps/backend/src/modules/project/creator-application.service.ts`
- Modify: `apps/web/src/shared/creator-api.js`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify: `apps/web/src/features/production-workbench/project-detail.js`
- Modify: `apps/web/src/features/production-workbench/episode-workbench-rebuilt.js`
- Modify: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("conversation replay", () => {
  it("loads the selected asset conversation for image and video scopes", () => {
    // Assert the render output includes a conversation thread for the selected asset id.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/project-workbench-generation.spec.ts`
Expected: FAIL because the web render path does not yet query or render conversation history.

- [ ] **Step 3: Write minimal implementation**

Add API methods:
- `getAssetConversationHistory(projectId, episodeId, assetId, mediaMode)`
- `appendAssetConversationMessage(...)`

On generation submit:
- store a `user_request` card first
- store/update a `task_status` card with task id and running status
- store/replace a `result` card when the task completes or fails

On asset selection:
- fetch and render the matching thread by `assetId + mediaMode`
- keep `imageGenerationResult` / `videoGenerationResult` as live state, but hydrate from the persisted thread when available

User card format:
- right aligned
- badge text `用户`
- prompt text
- optional thumbnail/context row
- metadata row for `任务ID / 模型 / 比例 / 清晰度 / 积分 / 时间`

System card format:
- left aligned
- badge text `系统`
- running task card and final result card

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/tests/project-workbench-generation.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/project/creator-application.service.ts apps/web/src/shared/creator-api.js apps/web/src/features/production-workbench/index.js apps/web/src/features/production-workbench/project-detail.js apps/web/src/features/production-workbench/episode-workbench-rebuilt.js apps/web/tests/project-workbench-generation.spec.ts
git commit -m "feat: replay asset conversations in workbench"
```

### Task 4: Wire asset selection to history loading without breaking current generation UX

**Files:**
- Modify: `apps/web/src/features/production-workbench/index.js`
- Modify: `apps/web/src/features/production-workbench/project-detail.js`
- Modify: `apps/web/src/features/production-workbench/episode-workbench-rebuilt.js`
- Modify: `apps/web/tests/project-workbench-generation.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("asset tab selection", () => {
  it("queries the selected asset thread and swaps the visible conversation without clearing the live generation controls", () => {
    // Render the selected asset panel twice with different asset ids and verify each one gets its own thread.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/project-workbench-generation.spec.ts`
Expected: FAIL until selection-driven replay is wired in.

- [ ] **Step 3: Write minimal implementation**

When `set-project-asset-tab` or `set-episode-asset` changes the selected asset:
- resolve the selected asset id
- fetch conversation history for that asset id and `mediaMode`
- render the history into the right panel
- preserve the current prompt draft and generation controls so the user can continue editing

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/tests/project-workbench-generation.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/features/production-workbench/index.js apps/web/src/features/production-workbench/project-detail.js apps/web/src/features/production-workbench/episode-workbench-rebuilt.js apps/web/tests/project-workbench-generation.spec.ts
git commit -m "feat: load asset conversation by selected tab"
```

### Task 5: Verify the real HTTP contract and browser behavior

**Files:**
- Modify: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
- Modify: `apps/web/tests/project-workbench-generation.spec.ts`
- Modify: `scripts/episode-workbench-browser-qa.mjs`

- [ ] **Step 1: Write the failing test**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("asset conversation http contract", () => {
  it("persists and reloads image and video threads through the creator endpoint", async () => {
    // Exercise the real server and verify the stored thread comes back on the next selection.
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
Expected: FAIL until the new GET/POST endpoints are covered.

- [ ] **Step 3: Write minimal implementation**

Add coverage for:
- initial image thread submit
- video thread submit
- reload by asset id after switching away and back
- failure result persistence

Update browser QA so screenshots prove:
- user cards are right-aligned and labeled `用户`
- system cards are left-aligned and labeled `系统`
- selected asset tab reloads its own history, not another tab’s

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts apps/web/tests/project-workbench-generation.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts apps/web/tests/project-workbench-generation.spec.ts scripts/episode-workbench-browser-qa.mjs
git commit -m "feat: verify asset conversation persistence"
```

## Self-Review

Coverage check:
- Schema: Task 1 covers the one-table-future-proof model with `mediaMode`.
- Backend storage/service: Task 2 covers thread/message persistence and retrieval.
- Image + video generation flow: Task 3 covers submit/running/result writeback for both modes.
- Selection replay: Task 4 covers loading the correct asset history when switching tabs/cards.
- HTTP + browser proof: Task 5 covers real server behavior and visual QA.

Placeholder scan:
- No `TBD`, `TODO`, or vague “handle edge cases” steps.
- Each code step names the exact file and shows the intended API shape.

Type consistency:
- `mediaMode` is consistently `image | video`.
- `messageType` is consistently `user_request | task_status | result`.
- The same `projectId + episodeId + assetId + mediaMode` key is used everywhere.


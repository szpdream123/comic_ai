# AI Storyboard Commit Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clicking "创建章节" on the AI storyboard preview creates one project episode, writes preview characters/scenes/props as episode assets, writes preview storyboards as shots, and saves image/video prompt drafts to the database.

**Architecture:** Add one creator-application service method that accepts the current preview `commitPayload`, resolves actor/project context, creates the episode, persists assets and shots, and stores `episode_generation_drafts` for each storyboard. Expose it through the phone-auth HTTP server and add a frontend API/action that commits the current preview then opens the new episode workbench.

**Tech Stack:** Node.js, TypeScript backend with SQL helpers, PGLite tests via `node --import tsx --test`, vanilla JS frontend.

---

### Task 1: Backend Commit Service

**Files:**
- Modify: `apps/backend/src/modules/project/creator-application.service.ts`
- Test: `apps/backend/src/modules/project/tests/creator-application.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a test that creates a project, calls `commitAiStoryboardPreview`, and asserts one episode, three asset rows, one shot, and image/video generation drafts were persisted.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test apps/backend/src/modules/project/tests/creator-application.service.spec.ts --test-name-pattern "commits AI storyboard preview"`

Expected: FAIL because `commitAiStoryboardPreview` is not defined.

- [ ] **Step 3: Write minimal implementation**

Add `commitAiStoryboardPreview` to `createCreatorApplication`. Reuse `createEpisodeForProject`, `writeLibraryAsset`, and `upsertShotsForProject`, then insert prompt drafts into `episode_generation_drafts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test apps/backend/src/modules/project/tests/creator-application.service.spec.ts --test-name-pattern "commits AI storyboard preview"`

Expected: PASS.

### Task 2: HTTP API

**Files:**
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Test: `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`

- [ ] **Step 1: Write the failing HTTP test**

Add a test posting to `/api/creator/projects/:projectId/ai-storyboard-preview/commit` and asserting the response includes the created episode and persisted storyboards.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts --test-name-pattern "ai storyboard preview commit"`

Expected: FAIL with 404 or missing route.

- [ ] **Step 3: Add route**

Route `POST /api/creator/projects/:projectId/ai-storyboard-preview/commit` to `creatorApplication.commitAiStoryboardPreview`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --import tsx --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts --test-name-pattern "ai storyboard preview commit"`

Expected: PASS.

### Task 3: Frontend Commit Flow

**Files:**
- Modify: `apps/web/src/shared/creator-api.js`
- Modify: `apps/web/src/features/production-workbench/index.js`
- Test: `apps/web/tests/creator-api.spec.ts`

- [ ] **Step 1: Write the failing API wrapper test**

Assert `creatorApi.commitAiStoryboardPreview(projectId, payload)` posts to `/api/creator/projects/:projectId/ai-storyboard-preview/commit`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test apps/web/tests/creator-api.spec.ts --test-name-pattern "commit ai storyboard preview"`

Expected: FAIL because the wrapper is missing.

- [ ] **Step 3: Add wrapper and UI action**

Add the API wrapper and handle `data-action="commit-ai-storyboard-preview"` by sending the current preview `commitPayload`, refreshing project detail, selecting the returned episode, and opening the episode workbench.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test apps/web/tests/creator-api.spec.ts --test-name-pattern "commit ai storyboard preview"`

Expected: PASS.

### Task 4: Verification

**Files:**
- No production edits unless test failures reveal a scoped issue.

- [ ] **Step 1: Run targeted backend tests**

Run: `node --import tsx --test apps/backend/src/modules/project/tests/creator-application.service.spec.ts --test-name-pattern "commits AI storyboard preview"`

- [ ] **Step 2: Run targeted HTTP tests**

Run: `node --import tsx --test apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts --test-name-pattern "ai storyboard preview commit"`

- [ ] **Step 3: Run targeted frontend API tests**

Run: `node --test apps/web/tests/creator-api.spec.ts --test-name-pattern "commit ai storyboard preview"`

- [ ] **Step 4: Inspect diff**

Run: `git diff -- apps/backend/src/modules/project/creator-application.service.ts apps/backend/src/modules/project/tests/creator-application.service.spec.ts apps/backend/src/entrypoints/phone-auth-dev-server.ts apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts apps/web/src/shared/creator-api.js apps/web/src/features/production-workbench/index.js apps/web/tests/creator-api.spec.ts`

Confirm changes are scoped to AI storyboard preview commit.

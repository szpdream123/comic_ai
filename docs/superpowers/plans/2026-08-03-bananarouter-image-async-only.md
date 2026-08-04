# BananaRouter Image Async-Only Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove every callable BananaRouter image synchronization path and enforce the documented asynchronous submit-and-poll contract.

**Architecture:** Keep the existing generation queue and provider adapter interfaces. Make the BananaRouter image adapter async-only at the validation and runtime boundaries, converge stored configuration with the existing unpublished migration, and keep every other provider protocol unchanged.

**Tech Stack:** TypeScript, Node.js test runner, PostgreSQL SQL migrations, standalone admin HTML/JavaScript, gstack browser QA.

---

### Task 1: Enforce the async-only provider configuration contract

**Files:**
- Modify: `apps/backend/src/modules/model-gateway/provider-adapter.factory.ts:400-450`
- Test: `apps/backend/src/modules/model-gateway/tests/bananarouter.provider-adapter.spec.ts`

- [ ] **Step 1: Write failing validator tests**

Add table cases that call `validateBananaRouterProviderConfig` with `mediaType: "image"` and assert:

```ts
assert.equal(validateBananaRouterProviderConfig({
  providerProtocol: "banana_router",
  providerModel: "gpt-image-2",
  mediaType: "image",
  invocationMode: "sync",
  providerConfig: synchronousImageProviderConfig,
}), "provider_request_format_media_mismatch");

assert.equal(validateBananaRouterProviderConfig({
  providerProtocol: "banana_router",
  providerModel: "gpt-image-2",
  mediaType: "image",
  invocationMode: "async_polling",
  providerConfig: asyncImageProviderConfig,
}), null);
```

Also assert that missing or non-documentary edit/query endpoints are rejected.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node scripts/run-tests.mjs apps/backend/src/modules/model-gateway/tests/bananarouter.provider-adapter.spec.ts
```

Expected: the synchronous image configuration is currently accepted, so the new assertion fails.

- [ ] **Step 3: Make validation async-only**

Replace the image-mode compatibility branches with one contract:

```ts
if (mediaType === "image") {
  if (requestFormat !== "banana_router_openai_images" || invocationMode !== "async_polling") {
    return "provider_request_format_media_mismatch";
  }
  if (!isBananaRouterImageEndpoint(createEndpoint, "/v1/images/generations/async")) {
    return "provider_request_format_media_mismatch";
  }
  if (!isBananaRouterImageEndpoint(editEndpoint, "/v1/images/edits/async")) {
    return "provider_request_format_media_mismatch";
  }
  if (!isBananaRouterImageQueryEndpoint(queryEndpoint)) {
    return "provider_query_endpoint_required";
  }
}
```

Add a query helper that accounts for URL encoding of the `{taskId}` placeholder:

```ts
function isBananaRouterImageQueryEndpoint(endpoint: string | undefined): boolean {
  if (!endpoint) return false;
  try {
    const url = new URL(endpoint);
    return url.origin === "https://api.bananarouter.com"
      && decodeURIComponent(url.pathname).replace(/\/+$/g, "") === "/v1/async-tasks/{taskId}";
  } catch {
    return false;
  }
}
```

Preserve the existing BananaRouter origin allowlist before these path checks.

- [ ] **Step 4: Re-run the focused test and verify GREEN**

Expected: all BananaRouter provider adapter tests pass.

### Task 2: Delete synchronous image submission behavior

**Files:**
- Modify: `apps/backend/src/modules/model-gateway/bananarouter.provider-adapter.ts:43-150`
- Test: `apps/backend/src/modules/model-gateway/tests/bananarouter.provider-adapter.spec.ts`

- [ ] **Step 1: Write failing runtime tests**

Add tests proving that every image submission:

```ts
assert.equal(request.headers.get("Idempotency-Key"), input.providerRequestId);
assert.equal(requestUrl, "https://api.bananarouter.com/v1/images/generations/async");
assert.deepEqual(result.artifacts, undefined);
assert.equal(result.externalRequestId, "task-image-async");
assert.equal(result.status, "accepted");
```

Add a regression response that contains a synchronous `data[].b64_json` payload without `taskID`; it must throw `banana_router_image_invalid_response` instead of returning `succeeded`.

- [ ] **Step 2: Run the focused test and verify RED**

Expected: the synchronous response is currently accepted as a completed result.

- [ ] **Step 3: Remove the branch**

In `submit`:

```ts
const endpoint = referenceImageUrls.length > 0
  ? this.config.editEndpoint!
  : this.config.createTaskEndpoint;

const response = await executeBananaRouterRequest(this.config.fetchImpl, endpoint, {
  method: "POST",
  headers: {
    authorization: `Bearer ${this.config.apiKey}`,
    "content-type": "application/json",
    "Idempotency-Key": input.providerRequestId,
  },
  body: JSON.stringify(requestBody),
});
```

Always parse `taskID`, return `accepted`/`running`, and delete the submission-time artifact parsing block plus `isAsyncImageEndpoint`.

In `recoverSubmission`, keep the 24-hour bound and return `this.submit(input)` without endpoint classification.

- [ ] **Step 4: Re-run the focused test and verify GREEN**

Expected: submissions can only complete through polling.

### Task 3: Complete the documented task-state mapping

**Files:**
- Modify: `apps/backend/src/modules/model-gateway/bananarouter.provider-adapter.ts:660-680`
- Test: `apps/backend/src/modules/model-gateway/tests/bananarouter.provider-adapter.spec.ts`

- [ ] **Step 1: Write failing poll-state tests**

Poll representative payloads and assert:

```ts
assert.equal((await pollWithStatus("retry")).status, "accepted");
assert.equal((await pollWithStatus("expired")).status, "failed");
assert.equal((await pollWithStatus("cancelled")).status, "failed");
```

- [ ] **Step 2: Run the test and verify RED**

Expected: `expired` currently maps to `accepted`.

- [ ] **Step 3: Add the terminal state**

Extend the failed status list:

```ts
if (["failed", "error", "canceled", "cancelled", "expired"].includes(normalized ?? "")) {
  return "failed";
}
```

- [ ] **Step 4: Re-run the test and verify GREEN**

Expected: all documented image states terminate or continue correctly.

### Task 4: Remove the synchronous rollback path from data convergence

**Files:**
- Modify: `packages/db/migrations/20260828-bananarouter-image-async-config-convergence.sql`
- Test: `apps/backend/src/modules/shared/db/tests/generation-migration-registration.spec.ts`

- [ ] **Step 1: Write a failing migration assertion**

After applying the migration, assert no synchronous convergence revision exists:

```ts
const revisions = await db.query(`
  SELECT count(*)::int AS count
  FROM ai_model_config_revisions
  WHERE model_config_id = $1
    AND reason = 'BananaRouter 图片异步配置收敛前同步回滚快照'
`, [model.id]);
assert.equal(revisions.rows[0].count, 0);
```

Keep the existing assertions for async endpoints, capability, queue, and idempotent reapplication.

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```powershell
node scripts/run-tests.mjs apps/backend/src/modules/shared/db/tests/generation-migration-registration.spec.ts
```

Expected: the migration currently inserts one synchronous rollback revision.

- [ ] **Step 3: Delete only the rollback revision insertion**

Remove the `INSERT INTO ai_model_config_revisions ... SELECT ... 'sync'` statement. Preserve row locks, async model update, dispatch policy upsert, and transaction behavior supplied by the migration runner.

- [ ] **Step 4: Re-run the migration test and verify GREEN**

Expected: migration applies twice, leaves the model async-only, and creates no synchronous revision.

### Task 5: Prevent the admin UI from producing BananaRouter image sync settings

**Files:**
- Modify: `apps/admin/index.html:8350-8460, 12460-12530`
- Test: `apps/admin/index.test.mjs`

- [ ] **Step 1: Write failing admin serialization tests**

Assert that a legacy BananaRouter image model with `invocationMode: "sync"` serializes as:

```js
assert.equal(result.invocationMode, "async_polling");
assert.equal(result.providerConfig.requestPath, "/v1/images/generations/async");
assert.equal(result.providerConfig.editEndpoint, "/v1/images/edits/async");
assert.equal(result.providerConfig.queryTaskEndpoint, "/v1/async-tasks/{taskId}");
assert.equal(result.dispatchPolicy.pollQueueName, "generation-poll-image");
```

Also assert the advanced editor does not offer `sync` as the selected mode for a BananaRouter image model.

- [ ] **Step 2: Run the admin UI test and verify RED**

Run:

```powershell
node --test apps/admin/index.test.mjs
```

Expected: at least the advanced editor still exposes the legacy sync choice.

- [ ] **Step 3: Apply the minimal UI constraint**

Reuse `fixedModelTemplate("image", providerName, "banana_router")` whenever the selected model is a BananaRouter image. The serialized payload must use the fixed async transport fields, while pricing, parameter schema, defaults, display metadata, and unrelated provider settings remain preserved.

Do not remove `sync` from the global invocation enum because other adapters still use it.

- [ ] **Step 4: Re-run the admin UI test and verify GREEN**

Expected: all existing admin tests plus the async-only regression pass.

### Task 6: Verify and review the finished change

**Files:**
- Review: all modified files above

- [ ] **Step 1: Run focused tests**

```powershell
node --test apps/admin/index.test.mjs
node scripts/run-tests.mjs apps/backend/src/modules/model-gateway/tests/bananarouter.provider-adapter.spec.ts
node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts -- --test-name-pattern "lets admins create, update, duplicate, and change status for model configs"
node scripts/run-tests.mjs apps/backend/src/modules/shared/db/tests/generation-migration-registration.spec.ts
node --env-file=.env --test scripts/runtime-schema-launchers.test.mjs scripts/migrate-user-scope.test.mjs
git diff --check
```

Expected: every command exits zero with no failed tests.

- [ ] **Step 2: Run gstack browser QA**

Restart the detached development stack, confirm `http://127.0.0.1:4310/admin/models` returns 200, inspect console/network failures, and verify the BananaRouter image editor displays async configuration. Do not import browser cookies or create an admin account without explicit credentials.

- [ ] **Step 3: Run gstack-review**

Review the full diff against `origin/main`, focusing on SQL safety, migration idempotency, async state enum completeness, retry duplication, provider URL safety, and frontend/backend contract drift. Fix mechanical findings and re-run affected tests.

- [ ] **Step 4: Report evidence**

Provide the acceptance URL, exact test counts, any blocked authenticated browser step, and confirm that other providers were not converted.

## Deployment and rollback safety

1. Deploy the adapter and workers that recognize both BananaRouter async image endpoints and the async task response before running the convergence migration.
2. Drain every worker still running an older revision, then explicitly apply the convergence migration while BananaRouter image traffic is paused.
3. After the migration succeeds, the minimum rollback version is this async-only implementation. Do not roll application or worker code back to a revision that treats `/v1/images/edits/async` as synchronous; that revision cannot safely interpret the provider `taskID` response or recover an ambiguous edit submission.
4. If an application rollback below that minimum is unavoidable, keep BananaRouter image traffic disabled and restore service only with a reviewed data migration plus a provider reconciliation procedure. Do not re-enable the removed synchronous fallback.
5. Verify generation, edit, polling, and task-center completion before resuming production traffic.

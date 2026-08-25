# GEO Citation Monitoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add auditable manual and official-API GEO citation monitoring for published Lingxi AI articles.

**Architecture:** Persist immutable question/answer snapshots in dedicated monitor run and result tables. A focused GEO monitoring service validates published-content scope, runs deterministic mention/citation analysis, and optionally calls the existing text gateway for supported official APIs. The existing admin page exposes one monitoring panel and never labels a result as internal model indexing.

**Tech Stack:** TypeScript, PostgreSQL, Node test runner, existing `TextModelGatewayService`, server-rendered admin HTML/JavaScript.

**Spec:** `docs/superpowers/specs/2026-08-25-geo-citation-monitoring-design.md`

## Global Constraints

- Only `super_admin` may access `/api/admin/geo/*` monitoring routes.
- Reuse `TextModelGatewayService`; do not add a model SDK.
- Automatic collection is limited to provider-matched official APIs; no captcha or anti-bot bypass.
- Raw questions, answers, and imported citation URLs are immutable evidence.
- UI copy says results are answer snapshots, not proof of an internal index.
- Preserve existing `coverage_status`, API signatures, model configuration, and unrelated dirty-worktree changes.

---

### Task 1: Monitoring schema and deterministic analyzer

**Files:**
- Create: `packages/db/migrations/20261020-create-geo-monitoring.sql`
- Modify: `apps/backend/src/modules/shared/db/migrations.ts`
- Create: `apps/backend/src/modules/geo/geo-monitoring-analyzer.ts`
- Create: `apps/backend/src/modules/geo/tests/geo-monitoring-analyzer.spec.ts`
- Modify: `apps/backend/src/modules/geo/tests/geo-schema.spec.ts`

**Interfaces:**
- Produces: `analyzeGeoMonitorAnswer({ answer, citedUrls, brandName, publishedHref }): GeoMonitorAnalysis`.
- Produces tables `geo_monitor_runs` and `geo_monitor_results` consumed by Task 2.

- [x] **Step 1: Write failing analyzer tests**

Cover literal fixtures for `not_mentioned`, whitespace-normalized `mentioned`, article-path `cited`, URL extraction, duplicate URL removal, and unrelated official URL not counting as the article citation.

- [x] **Step 2: Run analyzer test and verify RED**

Run: `node scripts/run-tests.mjs apps/backend/src/modules/geo/tests/geo-monitoring-analyzer.spec.ts`

Expected: FAIL because `geo-monitoring-analyzer.ts` does not exist.

- [x] **Step 3: Implement the minimal pure analyzer**

Export:

```ts
export type GeoMonitorResultStatus = "not_mentioned" | "mentioned" | "cited";
export function analyzeGeoMonitorAnswer(input: {
  answer: string;
  citedUrls: string[];
  brandName: string;
  publishedHref: string;
}): {
  status: GeoMonitorResultStatus;
  brandMentioned: boolean;
  articleCited: boolean;
  citedUrls: string[];
};
```

- [x] **Step 4: Run analyzer test and verify GREEN**

Run the command from Step 2 and expect all tests to pass.

- [x] **Step 5: Write failing schema tests**

Assert both tables, source/status checks, unique `(run_id, question_id)`, useful list indexes, question/content/admin foreign keys, and an update trigger that rejects changes to raw evidence columns.

- [x] **Step 6: Run schema test and verify RED**

Run: `node scripts/run-tests.mjs apps/backend/src/modules/geo/tests/geo-schema.spec.ts`

Expected: FAIL because the monitoring migration is absent or unregistered.

- [x] **Step 7: Add and register the migration**

Create UUID-keyed run/result tables, the immutable raw-evidence trigger, indexes, and register `20261020-create-geo-monitoring.sql` after the current latest migration.

- [x] **Step 8: Run schema and analyzer tests**

Run both Task 1 test files and expect zero failures.

### Task 2: Monitoring service and authenticated HTTP API

**Files:**
- Create: `apps/backend/src/modules/geo/geo-monitoring.service.ts`
- Create: `apps/backend/src/modules/geo/tests/geo-monitoring.service.spec.ts`
- Modify: `apps/backend/src/modules/geo/geo-platforms.ts`
- Modify: `apps/backend/src/entrypoints/phone-auth-dev-server.ts`
- Modify: `apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts`

**Interfaces:**
- Consumes: Task 1 tables and `analyzeGeoMonitorAnswer`.
- Produces: `createGeoMonitoringService({ db, gateway, resolveModelProvider, now })` with `listForContent`, `importManual`, and `runOfficialApi`.
- Produces: `GET /api/admin/geo/monitoring`, `POST /manual`, and `POST /official-api`.

- [x] **Step 1: Write failing service tests**

Use the real test database. Cover published content lookup, current published-version questions only, successful manual import, immutable history, `last_monitored_at`, automatic DeepSeek run, provider mismatch, manual-only platform, malformed model JSON, and failed run without result rows.

- [x] **Step 2: Run service tests and verify RED**

Run: `node scripts/run-tests.mjs apps/backend/src/modules/geo/tests/geo-monitoring.service.spec.ts`

Expected: FAIL because the service does not exist.

- [x] **Step 3: Implement platform capability and service**

Keep the existing platform response fields and add monitoring metadata. Resolve current published content and its linked questions once per operation. For official API runs, validate provider/platform compatibility before inserting a running batch, request strict JSON, insert all results transactionally, update question timestamps, and mark the run succeeded. On failure, mark only the run failed.

- [x] **Step 4: Run service tests and verify GREEN**

Run the command from Step 2 and expect zero failures.

- [x] **Step 5: Write failing HTTP tests**

Cover anonymous `401`, non-super-admin `403`, missing idempotency key, invalid payload, successful list/manual/official calls, and stable envelope shapes.

- [x] **Step 6: Run HTTP test and verify RED**

Run: `node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts -- --test-name-pattern "GEO monitoring"`

Expected: FAIL because monitoring routes are missing.

- [x] **Step 7: Wire monitoring routes**

Instantiate the service under the existing GEO auth boundary. Use `executeIdempotentGeoMutation` for both writes, `AdminBackedTextModelResolver` for provider validation, and the existing text gateway instance for model execution.

- [x] **Step 8: Run Task 2 tests**

Run the service tests plus the focused HTTP pattern and expect zero failures.

### Task 3: GEO admin monitoring panel

**Files:**
- Modify: `apps/admin/index.html`
- Modify: `apps/admin/index.test.mjs`

**Interfaces:**
- Consumes: Task 2 monitoring endpoints and added platform monitoring metadata.
- Produces: selection, manual import, official API trigger, history list, and recovery/error UI inside `geoOperationsPage()`.

- [x] **Step 1: Write failing admin UI tests**

Exercise rendered behavior through the existing VM harness. Assert monitoring data loads, the snapshot disclaimer renders, manual-only and official-API platforms render distinct controls, manual import sends exact answers, official run sends content/platform/model, history shows source/status/citations, and failed requests stay recoverable.

- [x] **Step 2: Run admin test and verify RED**

Run: `node --test apps/admin/index.test.mjs --test-name-pattern "GEO monitoring"`

Expected: FAIL because the panel and handlers do not exist.

- [x] **Step 3: Implement the smallest matching UI**

Extend the existing GEO store and load path. Add a card below content management, use existing button/form/table styles, escape every imported answer and URL, disable submit while running, refresh monitoring data after success, and show server error messages through existing mutation helpers.

- [x] **Step 4: Run admin UI test and verify GREEN**

Run the command from Step 2 and expect zero failures.

- [x] **Step 5: Run focused regression suite**

Run:

```powershell
node scripts/run-tests.mjs apps/backend/src/modules/geo/tests/geo-monitoring-analyzer.spec.ts apps/backend/src/modules/geo/tests/geo-monitoring.service.spec.ts apps/backend/src/modules/geo/tests/geo-schema.spec.ts
node scripts/run-tests.mjs apps/backend/src/entrypoints/tests/admin-platform-http.spec.ts -- --test-name-pattern "GEO"
node --test apps/admin/index.test.mjs
```

Expected: all commands exit 0 with no failed tests.

## Implementation Record

- Completed on 2026-08-25.
- Review hardening is split across the checksum-stable `20261021-harden-geo-monitoring.sql` and `20261022-fence-geo-monitor-runs.sql`: published-version binding, symmetric terminal timestamps, duplicate-running reconciliation, append-only raw evidence, and version/run fencing.
- Official API runs are capped at 20 linked questions and fenced against late completion; history reads are bounded to the latest 100 runs.
- Raw evidence is inserted while the run is still `running` and the run is sealed only after every expected row is stored in the same transaction. Database triggers reject cross-version questions, post-completion inserts, deletes, and identity/timestamp rewrites.
- Official calls refresh the run heartbeat around each provider request, carry the request-abort signal into the model gateway, and include the run ID in provider request metadata for failed-run attribution.
- Browser smoke covered manual import plus desktop and 390px mobile layouts. The admin history now exposes escaped, expandable raw snapshots for human verification.
- Article switches use a monotonic request token, including the A→B→A case, so an older response cannot clear loading or overwrite the latest snapshot.
- The official-API route shares the service path covered by real-database provider-request, provider mismatch, malformed/failure, republish-race, and late-result tests; HTTP coverage additionally verifies permissions, idempotency, invalid UUIDs, manual import/list, and manual-only platform rejection.

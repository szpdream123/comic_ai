# Minimal model service implementation plan

> **For agentic workers:** Use superpowers execution and verification skills. The constraints below record the initial offline implementation phase. The user subsequently authorized live integration and then committing this change to remote main via a normal push. Production deployment remains out of scope. See the execution updates below.

**Goal:** Independently run the model capabilities needed by promo_agent without changing comic_ai business behavior.

**Architecture:** Add `apps/model-service`, reusing existing model catalog and provider adapters. Dedicated PostgreSQL request and nonce tables provide product/subject isolation, idempotency, and a durable work queue. No dependency on old login, membership, wallet, project, canvas, workflow, storage ownership, or video workers. Existing admin model configuration remains authoritative. No Redis is needed for this limited queue.

**Tech stack:** Existing Node/TypeScript, pg, provider adapters, node:test and offline PGlite. No new dependencies.

**Spec:** User-approved scope in this conversation on 2026-09-29: only model calls; new product owns accounts/payment/credits/media orchestration. Video restricted to GlobalAiOpc for promo_agent. Minimum multimodal/audio protocols reuse supported providers; unsupported capabilities are explicit gaps.

## Global constraints
- Old product interfaces and behavior stay unchanged. Retire only this task's earlier, uncommitted membership/credit bridge additions after inspecting their diffs.
- No .env edits, live PostgreSQL/Redis/storage/provider calls, migration execution, paid calls, commits, deployment, or edits to promo_agent.
- Startup reads formal DATABASE_URL from project .env. Runtime errors report the relevant service/config key and stop; no guessed endpoint fallback.
- Never return provider credentials, raw diagnostics or arbitrary provider response objects.
- HTTP callers use dedicated HMAC service identity, model allowlist and signed subject context. Product authenticates end users and grants media access. Service enforces allowed HTTPS media origins without consulting legacy business tables.
- Calls are scoped by service identity + subject + signed idempotency key. A body field requestKey must match the Idempotency-Key header. Different request body under the same key conflicts. Unknown submission outcomes never automatically resubmit.
- Persist immutable model routing without secrets, use current server-side credentials on execution, and pin accepted routing during later polling.

## Tasks
- [x] 1. Define contracts and provider executor. Reuse chat streaming adapters behind non-streaming public responses, preserve multimodal content/tool calls, disable SDK POST retries. Reuse GlobalAiOpc video and existing supported speech adapters. Test outbound payloads and errors with injected fake fetch; document ASR gaps.
- [x] 2. Implement SQL store/schema with unique request scope, durable nonces, atomic leases/fencing and restart recovery. Prove concurrency, different-body conflicts, expired submit -> result_unknown (never resubmit), stale worker rejection, persisted completion, and read isolation using offline PGlite.
- [x] 3. Implement service validation, route layer, and processing loop. Test HMAC/body/key tampering, revoked model grants, cross-subject access, media credentials/hosts, terminal failures, restart/poll behavior and no old-business dependencies.
- [x] 4. Add independent runtime/configuration/migration commands; remove obsolete bridge changes only; write operator/client contract and offline evidence. Build graph must exclude old membership/billing/project/entrypoints.
- [x] 5. Run relevant old-provider regressions, new offline tests and bundle checks. Complete gstack review (security, contracts, testing, migration/performance/maintainability) and fix substantive findings.

## Interfaces
See `apps/model-service/src/contracts.ts`. Provider executor and store implementations only edit their assigned files. Runtime/HTTP owner consumes those contracts.

## Review focus
- Crash after supplier submission before task id save: preserve result_unknown, never duplicate a paid call.
- Concurrent retries and lease expiry: one submission, stale worker cannot overwrite newer state.
- Credential rotation or catalog edits while a task is pending: routing remains pinned, secrets stay server-side.
- Signed media URLs and untrusted nested parameters: validate only supported shapes; no legacy asset lookups or unrestricted proxy.
- Legacy compatibility: existing production sources end unchanged; distinguish baseline failures from regressions.

## Execution record
- Subsequent authorization and verification: formal PostgreSQL migration and dedicated service configuration completed; promo_agent adapted its client (14/14 local tests), and real text/video, authentication, idempotency and in-flight restart recovery passed. Video full decoding passed; exact 1280×720 output did not (actual 1256×720). See `docs/architecture/model-service-live-integration.md`. The user then authorized committing this feature and merging to remote main without an extra PR. The following bullets preserve the earlier implementation history.
- Scope approved by user; proceeding without another plan-approval round. Existing checkout reused to preserve ongoing work; branch is codex/canvas-project-style. Unrelated untracked files are left alone.
- Implemented the independent runtime, HTTP contract, provider executor, read-only catalog, and durable SQL request queue. Removed only this task's obsolete uncommitted bridge. `git diff --exit-code -- apps/backend` passed; the only tracked-file change is three package scripts.
- Final offline run: `npm run test:model-service` passed 49/49, including the independent runtime bundle/dependency check, actual SQL concurrency and database snapshot reload, multimodal/tools/video/speech payloads, durable nonces, grant revocation, and ambiguous paid-call handling.
- Review fixes proved by regression tests: retain validated model defaults; pin revoked admin credential references and forbid stale environment fallback; reject PostgreSQL-invalid Unicode before SQL and safely classify invalid provider results; wait for disconnected in-flight HTTP work before closing the database. Also bounded nested input and handled aborted/malformed HTTP requests without stopping the service.
- Existing adapter regressions: 32/34 passed (OpenAI 1, GlobalAiOpc 18, Aliyun 10, Cumob 3). The two unchanged Cumob failures concern raw provider error diagnostics (`cumob-text.adapter.spec.ts` lines 114 and 140); the new executor's separate HTTP/SSE sanitization tests pass. No unrelated legacy change was made.
- Verification is offline only. Formal PostgreSQL migration/startup, actual provider calls, deployment, and promo_agent client adaptation remain unexecuted. Dedicated ASR and unsupported Modelflare protocols are explicit contract gaps, not completed capabilities.
- User-requested second review completed with the adjacent promo_agent chat on 2026-09-29. Fixed five concrete issues: aliased defaults overriding video/speech requests, scalar coercion/silent parameter loss, incomplete text reported successful, credential key/ref collision falling back to environment secrets, and heartbeat/completion races stopping the service. All fixes stayed within apps/model-service; added 11 tests (60/60 pass). The adjacent chat independently confirmed these fixes, checked 29 invalid parameter cases and two mode-override cases, and agreed on the model-only boundary. Client migration requirements are recorded in docs/architecture/model-service.md; detailed findings in docs/architecture/model-service-review.md.

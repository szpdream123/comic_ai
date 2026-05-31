# Full Project Landing Plan

## Objective

Land the whole project as a real, continuously verifiable product:

- Frontend follows the MuseAI-style capture as closely as practical, not only for the episode workbench slice.
- Backend uses real business routes, permissions, idempotency, storage, credits, and persistence.
- Data is fully written to the database and storage instead of living only in client memory.
- The complete chain is connected and testable across the main product surfaces.

This plan extends beyond the already-advanced `project detail -> episodes tab -> episode workbench` slice and defines the remaining work needed before the project can honestly be called "landed".

## Product Surfaces

Current frontend feature groups in the repo:

1. `production-workbench`
2. `library-team`
3. `creator` shell/login entry

Current backend domain groups most relevant to delivery:

1. `identity`
2. `organization`
3. `project`
4. `storage`
5. `credit-billing`
6. `workflow-task`
7. `commerce-payment`
8. `admin-ops`
9. `audit`

## Verified Current State

The strongest current evidence is for the episode slice:

- Project detail, episode list, episode creation, episode workbench shell
- Episode-scoped assets/storyboards/generation configuration
- Direct upload: `prepare -> upload -> complete -> bind`
- Persisted image/video task creation
- Fixed mock image/video result writeback through real task/storage contracts
- Credit reserve/consume/release semantics
- 15 second polling and 15 minute timeout settlement
- Episode-scoped export of original video
- Browser QA with screenshots and geometry thresholds

Evidence already in place:

- `apps/backend/src/entrypoints/tests/phone-auth-dev-server.spec.ts`
- `apps/backend/src/entrypoints/tests/phone-auth-dev-server.storage-upload.spec.ts`
- `apps/web/tests/project-workbench-generation.spec.ts`
- `apps/web/tests/creator-api.spec.ts`
- `scripts/episode-workbench-browser-qa.mjs`
- `artifacts/episode-workbench-qa/*`

## Remaining Project-Level Gaps

### 1. Frontend parity is still concentrated in one slice

What is strong:

- Episode workbench desktop/mobile
- Project episode tab

What is still weaker:

- Home/front-door project entry flow polish
- Script page fidelity and connectedness
- Asset library pages
- Team pages and team dashboard
- Consistent visual language across all tabs

### 2. `library-team` is still prototype-heavy

Current state:

- Rendered pages exist and have unit tests
- Pages largely use fixture/prototype content
- Browser-level acceptance for these pages is missing or weak
- Real backend contracts for team/member/library filtering and mutations are not yet proven end to end

### 3. Commerce/admin/team flows are not proven end to end

Current state:

- Domain modules and service tests exist
- Frontend pages for pricing/member rules exist
- Product-level flow from frontend -> backend -> persistence -> UI refresh is not yet proven with the same rigor as the episode slice

### 4. Whole-product audit is incomplete

Current state:

- "Landed" is only strongly supported for the episode slice
- The rest of the product still needs requirement-by-requirement verification against current code and runtime behavior

## Delivery Principles

1. Do not weaken the episode slice while broadening scope.
2. Keep using real routes and persistence paths.
3. Expand verification outward instead of broadening scope only on paper.
4. Prefer adding browser-level and HTTP-level evidence before claiming a surface is done.
5. Keep mock provider outputs isolated to executor boundaries only.

## Execution Order

### Phase 1 - Freeze the episode slice as the reference standard

Required outcomes:

- Keep backend + frontend + browser QA green
- Continue CSS consolidation in `production-workbench.css`
- Keep improving project episode tab + workbench parity until the remaining gap is mostly aesthetic instead of structural

Acceptance:

- Existing tests remain green
- Episode browser QA remains green with geometry thresholds

### Phase 2 - Expand the same standard to `library-team`

Required outcomes:

- Define browser QA coverage for:
  - asset library
  - official/team asset scope switching
  - team page
  - team dashboard
- Identify which flows are still fixture-only and classify each one as:
  - real now
  - intentionally stubbed with explicit placeholder
  - needs backend implementation

Acceptance:

- Unit tests remain green
- Browser QA exists and records screenshots/evidence
- Placeholder-only areas are explicitly labeled and tracked, not mistaken for landed features

### Phase 3 - Make the front door coherent

Required outcomes:

- Audit login/session/app shell/script entry/project creation flow
- Ensure every route from login to project detail is restorable and persisted
- Ensure deep links and refresh behavior remain correct outside the episode page

Acceptance:

- Login/shell tests remain green
- Browser QA can sign in, land on shell, and navigate to project/library/team surfaces without broken state

### Phase 4 - Connect commerce/team/admin surfaces honestly

Required outcomes:

- Audit which frontend actions are still prototype placeholders
- For each placeholder:
  - either wire it to a real backend contract
  - or clearly mark it as intentionally deferred and excluded from "landed" status
- Prioritize:
  - member creation/management
  - credit/payment visibility
  - team/library gates

Acceptance:

- Real flows have HTTP + UI evidence
- Deferred flows are explicitly separated from shipped claims

### Phase 5 - Final completion audit

Required outcomes:

- Requirement-by-requirement proof across:
  - frontend fidelity
  - backend routes
  - persistence
  - permissions/CORS
  - direct upload
  - generation/task lifecycle
  - team/library surfaces
  - shell/login/project creation path

Acceptance:

- Every claimed product surface has:
  - code evidence
  - test evidence
  - runtime/browser evidence
- No required surface depends on weak or indirect proof

## Concrete Work Items

### Frontend

1. Continue consolidating `production-workbench.css` duplicate override layers.
2. Add browser QA for `library-team`.
3. Audit `script-page.js` and project creation surfaces for route persistence and visual parity.
4. Introduce more route-aware acceptance checks outside the episode slice.

### Backend

1. Keep the episode adapter routes stable and covered.
2. Audit real backend support for asset library/team pages.
3. Identify missing HTTP contracts for team/member/library actions.
4. Keep migrations and constraints aligned with newly claimed persisted features.

### QA and Evidence

1. Maintain `episode-workbench-browser-qa.mjs`.
2. Add `library-team-browser-qa.mjs`.
3. Keep screenshots in `artifacts/`.
4. Prefer machine-checkable thresholds where possible.

## Definition of Done for the Full Objective

The project is only fully landed when all of the following are true:

1. Main user journey from login to project creation to episode production is fully connected and verified.
2. Non-episode surfaces are either real and verified or explicitly excluded from landed claims.
3. Frontend parity is strong across the whole visible product, not just one tab.
4. Backend interactions are real, permissioned, persisted, and test-covered.
5. Data facts live in DB/storage, not just local UI state.
6. Browser-level evidence exists for all main surfaces.
7. The completion claim can survive a requirement-by-requirement audit from the current worktree alone.

## Immediate Next Steps

1. Keep improving the project episode tab/workbench parity.
2. Add browser QA coverage for `library-team`.
3. Audit `script` and `home` surfaces using the same evidence standard.
4. Classify remaining placeholder-only product actions before claiming whole-project completion.

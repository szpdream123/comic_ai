# Free conversation Skill Agent implementation plan

**Goal:** Connect the free conversation composer to the existing Skill plaza execution chain, with clear selection, progress, and follow-up behavior.

**Architecture:** Reuse the existing catalog, favorites, and user Skill API methods and `message.plazaSkillIds`. Keep built-in creative skills and existing generation controls. Scope all UI changes to the media-only Agent panel.

**Constraints:** Start from origin/main 84f3d529. Keep API signatures, schemas, ownership checks, generation billing and reference authorization unchanged. No production database changes. The user requested autonomous decisions without repeated approval and, after acceptance on 2026-09-18, authorized one commit directly to remote main.

## Design

Use the existing theme tokens and typography. The conversation remains the main working area; the composer has a compact mode/settings/Skill toolbar, readable selected Skill chips, and an anchored searchable picker. Catalog skills display their source and description. Existing built-ins remain available as creative shortcuts. Skill selection prepares a draft and switches to Agent mode; it never starts generation. Loading and failure states must remain actionable.

## Tasks

- [x] Add controller tests in `apps/web/tests/free-conversation-plaza-skills.spec.mjs`: catalog/favorites/mine loading; choosing and removing Skills without destroying text; exact IDs sent to the existing API; failed submission preserves selection; slash opening; catalog failure and retry.
- [x] Run `node --test apps/web/tests/free-conversation-plaza-skills.spec.mjs` and record failing behavior before implementation.
- [x] Extend `apps/web/src/features/new-canvas/canvas-agent-panel.js` using existing catalog state and loader. Render selection and searchable sources, wire both composer input paths, preserve built-in selection and error handling.
- [x] Adjust `apps/web/src/features/new-canvas/free-conversation-agent.css` for picker placement, source tabs, chips, focus and mobile sizes; preserve theme tokens and resize affordance.
- [x] Review backend Skill resolution and follow-up boundaries. Add only confirmed fixes and focused tests; do not redesign the execution engine.
- [x] Run free conversation and existing Agent tests; perform gstack browser checks with local fixtures. No paid media tasks submitted.
- [x] Review the final diff against origin/main and fix confirmed regressions.
- [x] Complete live password-login and Skill selection acceptance; the user accepted the result on 2026-09-18. Paid generation was not submitted during QA.

## Verification — 2026-09-17

- Frontend: 171/171 tests pass across free-conversation suites and `new-canvas-agent.spec.mjs`; the new plaza suite has 11 tests. History-loading regressions include editing during load and overlapping A/B/A switches.
- Backend: 60/60 tests pass across context service, tool registry, free conversation execution, skills, tools, and plaza Skill suites. Tests use isolated in-memory PGlite, without loading runtime `.env`.
- `buildProductionRuntime()` passes; existing duplicate-key warnings remain. `git diff --check` passes.
- gstack browser checks with fixture data cover desktop 1440×960 and mobile 390×844, slash picker, search, keyboard selection, source tabs, Escape, selection chips, and popup bounds. These checks do not establish real backend or model-provider integration.
- Independent frontend/backend review and final adversarial review completed; confirmed selection, pagination, focus, and context-boundary regressions were fixed and retested.

## Initial runtime acceptance limits

The preview uses the project's formal `.env`, including `DATABASE_URL`. An initial password-login attempt encountered PostgreSQL `Connection terminated unexpectedly`, and port 4310 subsequently stopped listening. No alternative database endpoint or SMS login was used. The service was restored and password login succeeded during the follow-up below.

The existing full-app preview startup also has baseline blockers: missing absolute canvas-runtime imports during web bundling and the source preview migration audit rejection for `production_agent_conversations.workspace_json`. These unrelated startup issues have not been changed. The frontend production bundle and live generation flow are not verified.

Desktop/mobile fixture screenshots are under `.local/`. The implementation was prepared on `codex/free-conversation-skill-agent` in the isolated preview worktree. The original checkout's unrelated changes and runtime secrets are excluded from this delivery.

## Follow-up: slash lookup and pointer selection

The user reported that entering `/` displayed no Skills. Reproduced with a populated catalog: the search treated `/` as literal title text. The free-conversation filter now ignores leading command slashes, so `/` lists all Skills and `/短剧` filters by the title.

Live browser verification exposed a second issue absent from the original fixture: the production host forwards both `input` and `change`. Blurring the search during a mouse click re-rendered the unchanged results before mouseup and detached the clicked card. The controller now skips an unchanged search value; the browser fixture also forwards `change` to represent production behavior.

- Added three regressions; each failed before its corresponding fix. All 174 frontend tests now pass.
- Port 4310 was restored with the configured `.env`. During this follow-up, password login with the configured integration account succeeded; the earlier login blocker did not recur.
- Verified the real Skill catalog on `http://127.0.0.1:4310/#free-generation`: `/` displays catalog and built-in Skills, `/短剧` filters correctly, Enter selects, and mouse clicks immediately select both 漫剧角色一致性 and 短剧分镜导演. No paid generation was submitted.
- Browser fixture execution verified an interjection carries the selected plaza Skill ID. Actual model generation remains untested.
- The served production-transformed module contains the fix; reload the page to update the active browser session. Evidence: `.local/slash-skill-live-fixed.png` and `.local/slash-skill-live-selected.png`.

## Pre-landing verification — 2026-09-18

Fresh frontend tests: 174/174. Fresh backend tests: 60/60. Production runtime build check passed using the unchanged-source cache. Final adversarial review found no confirmed blocker; whitespace checks passed. Remote main remained at the original base, so this change can be delivered as one fast-forward commit without a merge commit.

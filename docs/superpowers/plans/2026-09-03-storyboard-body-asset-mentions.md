# Storyboard Body Asset Mentions Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** On “引入到对话框”, replace names declared in the selected shot's asset table with real image mention tokens in the right-hand composer, leaving the saved shot unchanged.

**Architecture:** Keep existing reference collection, deduplication and ordering. Add an import-only compiler that reads the normalized asset table and reuses its resolved image tokens in prose. Preserve existing explicit mentions, table labels, source text and all shared provider contracts. Missing or conflicting bindings retain readable names and produce the existing import warning.

**Tech Stack:** JavaScript ES modules, Node test runner, existing tsx integration tests and prompt-editor document parser. No dependency changes.

**Spec:** User-confirmed requirements in this conversation, summarized below.

## Global Constraints / Confirmed Spec

- Only right-hand composer text changes on import; left-hand saved description does not change.
- All declared character, scene and prop names are eligible. Repeated occurrences reuse one reference.
- Preserve current attachment order and match image numbers to the actual video payload order.
- Keep the asset table's left-hand names and existing manual mentions intact.
- Missing images and ambiguous names remain readable, with a warning rather than a guessed binding.
- Match longer declared names first; do not replace a short name inside another known asset name.
- Do not add assets merely because unrelated project-wide names occur in prose.
- Keep method signatures, API/data contracts and existing defensive fallback paths unchanged.
- No production services, credentials, generation requests, pushes, deployment or unrelated cleanup.

## Task 1: Import compiler and integration

**Files:**
- Create `apps/web/src/features/production-workbench/storyboard-body-asset-mentions.js`.
- Modify only the import and `appendSelectedStoryboardToPrompt` integration in `apps/web/src/features/production-workbench/index.js`.
- Create `apps/web/tests/storyboard-body-asset-mentions.spec.ts` for public import flow tests.

**Interfaces:**
- Consume the normalized import prompt, original asset-table text, ordered image references and available asset metadata.
- Produce `{ prompt, warning }` for the existing composer setter and import warning result. Do not reorder or mutate references.

- [x] Write integration fixtures calling the real `appendSelectedEpisodeAssetToPrompt`, `resolvePromptEditorMentionReferences`, document parser and `buildVideoGenerationPayload`.
  - A scene / 苏晚 / 旧书 fixture expects `【@图2】拿着【@图3】` even when the first prose mention is 苏晚.
  - Assert saved description and reference order remain unchanged across two imports.
  - Assert existing explicit tokens, table left-hand names, missing assets, duplicate names and longer names behave as specified.
- [x] Run `node --import tsx --test --test-force-exit apps/web/tests/storyboard-body-asset-mentions.spec.ts`; confirm missing automatic prose binding causes failure.
- [x] Add the import-only compiler and call it after existing numbering normalization. Use table mappings as the whitelist, protect existing mention spans and table text, resolve ambiguity conservatively, and merge warnings with the existing storyboard-image warning.
- [x] Re-run new tests and the existing `apps/web/tests/project-workbench-generation.spec.ts` suite. Keep existing first-frame / storyboard-only behavior unchanged.

## Task 2: Review and verification

- [x] Run prompt-editor document regression tests and frontend production bundling verification without launching runtime services.
- [x] Review full task diff using gstack review checklist and independent specialist/adversarial review. Check source immutability, alias conflicts, token numbering and payload identity.
- [x] Resolve in-scope findings, rerun affected tests, update this checklist with actual evidence.
- [x] Report changed behavior and precise verification limits. Leave changes uncommitted for user review; do not push.

## Baseline

On `a5275d4a`, five relevant existing import regressions passed (shared image aliases, missing preview recovery, same-name kinds, stale numbering, latest inline text). Working tree was clean.

## Verification evidence (2026-09-03)

- New public-flow tests: 16 passed, 0 failed. Initial feature tests first failed against the original implementation; review regression cases were also observed failing before their fixes.
- Public-flow assertions include real prompt-editor mention documents and thumbnail identity, serialization, video payload file order, repeated imports, source immutability, missing images, duplicate names, aliases, longer names, storyboard-only mode, mixed resolved/unresolved targets and structural headings.
- Existing generation + prompt-editor suites: 991 tests, 910 passed / 81 failed. Re-ran both unchanged `HEAD` source (in-memory Node loader hook) and working source: the 81 failing test names were identical, with zero new failures. These existing failures were not changed.
- In-memory esbuild bundle verification succeeded using browser/ESM target and the production `/vendor/*` external setting. Both HEAD and working source produced the same 22 duplicate-key warnings; no bundle output was written.
- `git diff --check` passed; Git only reported its existing LF-to-CRLF working-copy warning.
- Independent testing, maintainability, performance and UI-path reviews completed. Adversarial review found a structural heading collision, now fixed. Other fixed findings: normalized-name conflicts, multi-image RHS ambiguity, same-image dedup identity, inline table-prefix prose and partially missing multi-reference RHS. Final targeted rechecks reported no remaining findings.
- Additional Codex CLI review could not start: local installation lacks `@openai/codex-win32-x64`. No dependency installation was attempted.
- Limits: no live-browser acceptance test, runtime services or paid video generation. Chip rendering was checked through the real document/render code path and integration assertions, not visually in a running browser. No commit, push, deployment or environment changes.

## Acceptance and merge authorization (2026-09-03)

- The limits above describe the implementation-stage handoff. A subsequent local acceptance server used the project's formal `.env`; the homepage and feature module returned HTTP 200. No paid generation was submitted by the agent.
- The user accepted the result and explicitly authorized committing, pushing and merging into remote `main`.
- Fresh pre-merge verification: 16 targeted tests passed; the existing suites still had exactly the same 81 baseline failures (910 / 991 passed), with no new failures. Browser bundling succeeded with the same 22 baseline warnings. Final coverage, plan and adversarial rechecks found no blockers.
- Merge scope is the feature, regression tests and this plan only. Environment files, acceptance launchers/logs and deployment operations are excluded.

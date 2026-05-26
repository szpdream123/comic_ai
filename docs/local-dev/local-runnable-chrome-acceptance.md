# Local Runnable Alpha Chrome Acceptance Guide

This guide defines how developers must use `@chrome` to self-accept frontend/backend integration work for Local Runnable Alpha.

The goal is not to prove that one isolated function works. The goal is to prove that a real browser user can finish the product journey through the real frontend, real dev server, real cookies, and real creator APIs.

## Required Journey

Every owner must start from a clean local run and verify the same product journey, with owner-specific focus areas:

```text
npm run dev
  -> open the local URL with @chrome
  -> log in with the dev phone-auth flow
  -> create a project
  -> parse a script
  -> confirm one asset and confirm all assets
  -> run or skip calibration
  -> generate images
  -> generate videos
  -> create export preview
  -> refresh the page
  -> confirm state is restored from backend APIs
```

Use the Chrome plugin because this gate must exercise real page JavaScript, browser cookies, UI events, console behavior, and network responses. HTTP smoke alone is not enough.

## Evidence Rules

For each owner self-check, record:

- Date, owner, branch, commit, and local URL.
- Chrome journey result: pass or fail.
- The exact step that failed, if any.
- Console errors and unhandled promise rejections.
- Relevant network request path, method, status, request idempotency key presence, and response error code.
- Screenshot or short description of the page state when the issue was found.
- Whether the issue blocks Local Runnable Alpha.

Write evidence into `docs/local-dev/local-runnable-alpha-bug-log.md`. If there are no bugs, still add a pass entry with the commands and Chrome journey completed.

## Bug Record Template

Each bug or problem must be written as Markdown with this structure:

```markdown
## BUG-YYYYMMDD-NN: short title

**Owner:** Developer A | Developer B | Developer C
**Found by:** name
**Status:** Open | Fixed | Verified | Deferred
**Severity:** Blocker | High | Medium | Low
**Journey step:** login | create | parse | assets | calibration | image generation | video generation | export | refresh recovery
**Environment:** branch, commit, local URL, browser profile if relevant

### Problem Scene

- URL:
- Preconditions:
- Exact steps:
- Expected:
- Actual:
- User-visible symptom:
- Console evidence:
- Network evidence:
- Screenshot or page-state note:

### Root Cause

- Responsible layer: frontend | backend | contract | data/state | DX/tooling | docs
- Root cause:
- Why it was not caught earlier:
- Files/functions involved:

### Long-Term Fix

- Recommended solution:
- Why this is the right long-term fix:
- Alternatives considered:
- Tests or gates to prevent regression:
- Owner:
- Target task or PR:
```

Do not record only the symptom. A valid bug record must include the problem scene, the root cause, and the long-term fix. If root cause is unknown, keep the issue `Open` and write the next investigation step.

## Owner Focus

Developer A focuses on backend/API truth:

- Every R0 required write route is visible in Chrome network traffic with an idempotency key.
- Missing auth, invalid state, and idempotency conflict paths produce stable machine error codes.
- Replay-sensitive actions do not create duplicated projects, workflows, provider requests, or export records.

Developer B focuses on frontend/user truth:

- Every visible button or form in the journey triggers the intended creator API call.
- Busy states, toasts, field errors, and recovery states are understandable and do not trap the user.
- Refresh recovery uses backend state, not local-only business facts.

Developer C focuses on DX/gate truth:

- A new developer can follow docs from zero to a passing Chrome journey.
- `npm test`, `npm run smoke:local`, and Chrome acceptance evidence all line up.
- The bug log is complete enough for another developer to reproduce, fix, and verify issues without oral context.

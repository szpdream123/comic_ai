# Local Runnable Alpha Bug Log

Use this file to record all problems found while validating Local Runnable Alpha with `@chrome`, HTTP smoke, or local test commands.

Rules:

- Record pass entries and fail entries. A silent pass is not acceptable for this gate.
- Each bug must include problem scene, root cause, and long-term fix.
- If root cause is unknown, mark the issue `Open` and write the next investigation step.
- Do not delete historical bug records after fixing. Add a verification note instead.

## Acceptance Pass Entries

```markdown
### PASS-YYYYMMDD-NN: owner journey

**Owner:** Developer A | Developer B | Developer C
**Branch/commit:**
**Local URL:**
**Commands run:**
**Chrome journey completed:**
**Known non-blocking notes:**
```

## Bug Entries

```markdown
## BUG-YYYYMMDD-NN: short title

**Owner:** Developer A | Developer B | Developer C
**Found by:**
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

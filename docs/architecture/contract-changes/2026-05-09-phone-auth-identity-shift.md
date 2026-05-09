# Contract Change: Phone Auth Identity Shift

> Date: 2026-05-09
> Status: accepted
> Owner: auth implementation
> Affected modules: identity, organization, web, contracts, db

## Change

The P0 identity entry flow changes from email-code login to mainland China phone-code login.

Key contract changes:
- login identifier becomes `phone_e164`
- a dedicated `login_challenges` table replaces the earlier `login_codes` assumption for the first auth slice
- `auth_sessions` remain the server-side session truth
- the first frontend-connectable login slice uses a development-only debug challenge endpoint instead of a real SMS provider

## Reason

The immediate product need is a frontend-connectable login flow for a China-first creator workflow. Phone verification is a better fit than email for the current user path, and a challenge-based shape aligns better with later resend, lockout, and real SMS-provider integration.

## Compatibility

- Backward compatible? no
- Migration required? yes
- API/event version impact: yes, future auth contracts should reference phone-code flow rather than email-code flow
- Data migration impact: `users.email` is no longer the only required login identity field; `users.phone_e164` is introduced

## Verification

- Tests to add/update:
  - `apps/backend/src/modules/identity/tests/login-challenge.spec.ts`
  - `apps/backend/src/modules/identity/tests/session.spec.ts`
  - `apps/backend/src/modules/identity/tests/auth-http.handlers.spec.ts`
  - `apps/web/tests/login-page.spec.ts`
- Rollback plan:
  - remove `phone_e164`, `login_challenges`, and the phone auth handlers if the product direction changes before external users depend on them

## Decision

Accepted by implementation owner during the first auth development slice.

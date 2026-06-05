# Admin User Management Design

## Goal

Add an admin user management function for the standalone admin app. The feature should let operators inspect and manage:

- User identity and profile information.
- Account status.
- Organization, workspace, team, and role membership.
- Credit balance, reserved credits, and credit history.
- Manual credit adjustments with audit records.
- Risk and support context for payment, generation, and abnormal credit states.

This is a documentation-only design. It does not require changing the current code yet.

## Placement

The static admin page belongs under `apps/admin/`, separate from `apps/web`.

Recommended pages:

```text
apps/admin/
  users.html
  user-detail.html
```

## Existing Data Model Fit

The current project already has the main concepts this page needs:

- `users`: user identity, phone, email, display name, account status.
- `organizations`: tenant scope and cached credit balances.
- `workspaces`: workspace scope.
- `memberships`: user membership, role, and account relationship.
- `team_member_profiles`: team/sub-account metadata and member-level credit fields.
- `credit_reservations`: frozen credits for running tasks.
- `credit_reservation_allocations`: one-time consume/release settlement facts.
- `credit_ledger_entries`: append-only credit ledger.
- `billing_orders` and payment risk tables: paid credits and payment exceptions.
- `audit_events`: admin/manual operation audit trail.

The admin UI should model user-facing data from these facts. It should not introduce direct balance editing as a shortcut.

## User List

The first user management page should show a dense table:

| Column | Notes |
| --- | --- |
| User ID | Shortened ID with copy action. |
| Display name | `users.display_name`. |
| Phone / email | Mask phone by default. Show full value only with permission and audit. |
| Status | Active, disabled, suspended, deleted/archived if later supported. |
| Organization | Primary organization or count if multiple. |
| Role | Owner/Admin/Producer/Creator/Viewer/sub-account role. |
| Available credits | Derived from tenant/member credit facts. |
| Reserved credits | Credits frozen by running tasks. |
| Last login | If available. |
| Created at | Account creation time. |
| Actions | View, disable/enable, adjust credits, view ledger. |

Filters:

- Keyword: user ID, masked phone, email, display name.
- Status.
- Organization.
- Role.
- Credit state: enough balance, low balance, zero balance, reserved credits, abnormal/manual review.
- Registration date.
- Last login date.

## User Detail

Recommended tabs:

1. **Profile**
   - Display name, phone, email, status, created time, last login time.
   - Authentication notes such as phone auth provider and masked phone.
2. **Organizations And Roles**
   - Organization/workspace memberships.
   - Role and capability summary.
   - Sub-account or team member profile.
3. **Credits**
   - Available balance.
   - Reserved balance.
   - Total granted.
   - Total consumed.
   - Total released/refunded.
   - Recent reservations and ledger entries.
4. **Orders And Payments**
   - Billing orders, payment status, granted credits, paid-without-credit risks.
5. **Generation Tasks**
   - Recent model generation tasks for this user or their organization.
   - Task status, estimated credits, consumed/released credits.
6. **Audit**
   - Admin actions affecting this user, their membership, or credits.

## Credit Balance Scope

The product has organization-level and team/sub-account credit behavior. The admin UI must be clear about which balance is being shown.

Use these labels:

| Balance | Meaning |
| --- | --- |
| Organization available credits | Tenant-level available credits. Usually `organizations.credit_balance_cached`. |
| Organization reserved credits | Tenant-level frozen credits. Usually `organizations.credit_reserved_cached`. |
| Member allocated credits | Credits assigned to a team member/sub-account, if team-level allocation is enabled. |
| Member available credits | Member allocation minus member usage/reservations, if tracked. |
| Reserved by tasks | Credits frozen by active generation tasks. |

Do not show one ambiguous "user credits" number unless the backend has resolved the exact scope.

## Credit Management Actions

The admin should support controlled credit actions:

| Action | Purpose |
| --- | --- |
| Grant credits | Add credits for manual compensation, promotion, or support. |
| Deduct credits | Remove credits for correction or abuse response. |
| Transfer/allocate credits | Move organization credits into a member/sub-account allocation if team allocation is enabled. |
| Release stuck reservation | Return credits frozen by a failed/stuck task after review. |
| Consume reservation | Confirm final consumption for a task after manual review. |
| Mark manual review resolved | Close a credit reservation requiring human judgment. |

Every action requires:

- Operator user ID.
- Target user ID and organization ID.
- Reason.
- Idempotency key.
- Before/after balance snapshot.
- Audit event.
- Append-only ledger entry where credits change.

## No Direct Balance Editing

Admins must not directly edit cached balance fields.

Correct flow:

```text
admin action
  -> validate permission and reason
  -> create ledger fact
  -> update cached balance in same transaction
  -> create audit event
  -> return before/after summary
```

Incorrect flow:

```text
UPDATE organizations SET credit_balance_cached = ...
```

Cached balances are read models. They can be repaired from `credit_ledger_entries`; they are not the source of truth.

## Credit Ledger Entry Types

The admin page should display ledger rows with clear labels:

| Entry type | Admin label |
| --- | --- |
| `grant` | Credit grant |
| `reserve` | Task reservation |
| `consume` | Task consumed |
| `release` | Reservation released |
| `adjustment` | Manual adjustment |
| `refund` | Refund/credit return |
| `correction` | Accounting correction |

If the current schema uses a smaller enum, the UI should still reserve these labels for future extension and map current entry types to the closest display label.

## Credit Adjustment Request Shape

Future backend endpoint example:

```json
{
  "organizationId": "10000000-0000-4000-8000-000000000001",
  "targetUserId": "90000000-0000-4000-8000-000000000001",
  "scope": "organization",
  "action": "grant",
  "amount": 500,
  "reason": "Support compensation for failed Seedance task",
  "metadata": {
    "ticketId": "SUP-1024",
    "relatedTaskId": "task-123",
    "source": "admin_user_management"
  }
}
```

Response example:

```json
{
  "ledgerEntryId": "ledger-123",
  "auditEventId": "audit-123",
  "organizationId": "10000000-0000-4000-8000-000000000001",
  "targetUserId": "90000000-0000-4000-8000-000000000001",
  "amount": 500,
  "balanceBefore": {
    "available": 1200,
    "reserved": 300
  },
  "balanceAfter": {
    "available": 1700,
    "reserved": 300
  }
}
```

## Permissions

Recommended permission names:

- `admin:user:view`
- `admin:user:update_status`
- `admin:user:view_sensitive_identity`
- `admin:credit:view`
- `admin:credit:adjust`
- `admin:credit:release_reservation`
- `admin:credit:consume_reservation`
- `admin:audit:view`

Sensitive operations must require elevated admin/ops roles:

- Viewing full phone/email.
- Disabling users.
- Granting or deducting credits.
- Resolving stuck credit reservations.
- Viewing payment risk details.

## Audit Requirements

Every admin mutation must create an audit event:

| Field | Requirement |
| --- | --- |
| `actor_user_id` | Operator performing the action. |
| `target_type` | `user`, `organization`, `credit_reservation`, or `credit_ledger_entry`. |
| `target_id` | Target record ID. |
| `event_type` | Stable event type, for example `admin.user.disabled` or `admin.credit.adjusted`. |
| `reason` | Required human-readable reason. |
| `metadata` | Non-sensitive details such as ticket ID, related task ID, before/after summaries. |

Do not write raw phone numbers, session tokens, SMS codes, API keys, or provider secrets into audit metadata.

## Status Actions

User status actions:

| Action | Behavior |
| --- | --- |
| Disable user | Prevent login/session creation and block new domain writes. Existing running tasks continue unless separately canceled. |
| Enable user | Restore login/domain access if memberships and organization are active. |
| Suspend user | Optional future state for abuse/risk review; may keep data visible but block generation/payment actions. |

The user detail page should show whether the user is blocked by:

- User status.
- Organization status.
- Membership status.
- Role/capability limits.

## Credit Risk States

Show these states prominently:

- Available credits below configured threshold.
- Reserved credits older than expected task timeout.
- `credit_reservations.status = manual_review_required`.
- Paid order exists but no grant ledger entry.
- Balance cache differs from ledger recomputation.
- User disabled while active reservations exist.

## Admin UI Components

For the static admin page:

- User summary cards: total users, active users, disabled users, low-credit users.
- User table with filters.
- User detail drawer/page.
- Credit balance panel.
- Credit ledger table.
- Manual adjustment modal.
- Reservation review panel.
- Audit timeline.

The adjustment modal must show:

- Target user and organization.
- Current available/reserved credits.
- Action type.
- Amount.
- Reason.
- Related ticket/task/order fields.
- Predicted balance after action.
- Confirmation checkbox for deductions or large grants.

## Backend Safety Rules

- Credit-changing admin actions must be idempotent.
- Credit-changing admin actions must run in a database transaction.
- Cached balances must be updated only from ledger facts.
- Deductions must not create negative available balance unless an explicit privileged correction flow allows it.
- Releasing or consuming a reservation must be single-settlement only.
- Manual credit adjustment must not mutate historical ledger entries.
- Every mutation must write an audit event in the same transaction or fail.
- Full identity fields must be masked unless the operator has sensitive identity permission.

## Static Page Mock Data

The first static page should include sample users:

1. Active owner with healthy organization credits.
2. Creator with low member allocation.
3. Disabled user with no active sessions.
4. User with running generation tasks and reserved credits.
5. User with `manual_review_required` credit reservation.
6. User with paid order but missing credit grant.

This gives the UI enough variety to validate filters, risk badges, and adjustment flows.

## Non-Goals

- No real backend calls in the static page.
- No raw secrets or full phone numbers in static mock data.
- No direct edit of cached balances.
- No integration with `apps/web`.
- No implementation of permissions yet; only document the permission names and expected behavior.

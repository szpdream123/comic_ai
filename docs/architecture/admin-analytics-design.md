# Admin Analytics Design

## Goal

Add an admin statistics function for daily recharge and credit consumption records across all users. The admin should answer:

- How much money was paid each day?
- How many credits were granted each day?
- How many credits were consumed each day?
- Which users/organizations contributed to recharge and consumption?
- Which models, tasks, or projects consumed credits?
- Are there abnormal states such as paid-without-credit, stuck reservations, refunds, or ledger drift?

This is a documentation-only design. It does not require changing the current code yet.

## Placement

The static admin app should add:

```text
apps/admin/
  analytics.html
  analytics-recharge.html
  analytics-credits.html
```

These pages remain independent from `apps/web`.

## Data Sources

Recharge statistics should come from payment and order facts:

- `billing_orders`
- `payment_intents`
- `payment_provider_events`
- `payment_risk_events`
- `credit_ledger_entries` where `entry_type = 'grant'` and `source_type = 'payment_order'`

Credit consumption statistics should come from credit facts:

- `credit_ledger_entries`
- `credit_reservations`
- `credit_reservation_allocations`
- `ai_generation_task_snapshots`
- `workflows`
- `tasks`
- `ai_model_configs`
- `users`, `memberships`, `organizations`, `workspaces`

The statistics UI should prefer ledger facts over cached balances. Cached balances are useful for current summaries, not historical reporting.

## Daily Dashboard

The main analytics page should show:

| Metric | Meaning |
| --- | --- |
| Paid amount today | Sum of successful paid orders for selected day. |
| Recharge credits today | Sum of credit grants from paid orders/manual grants. |
| Consumed credits today | Sum of `credit_ledger_entries.entry_type = 'consume'`. |
| Released credits today | Sum of `entry_type = 'release'`. |
| Reserved credits today | Sum of `entry_type = 'reservation'`. |
| Active paying users | Count of users/organizations with successful paid orders. |
| Active consuming users | Count of users/organizations with consumed credits. |
| Paid without credit | Paid orders missing grant ledger entries. |
| Manual review credits | Reservations or tasks requiring manual review. |

Default date range:

- Today
- Yesterday
- Last 7 days
- Last 30 days
- Custom range

## Recharge Statistics

### Daily Recharge Summary

Recharge summary should group by day:

| Column | Source / Rule |
| --- | --- |
| Date | `paid_at` day, normalized to product/admin timezone. |
| Paid orders | Count of `billing_orders.status = 'paid'`. |
| Paid amount | Sum `billing_orders.amount_minor` grouped by currency. |
| Granted credits | Sum paid order grant ledger entries. |
| Paying organizations | Count distinct `organization_id`. |
| Paying users | Count distinct `created_by_user_id` or order actor if available. |
| Paid without credit | Count paid orders where `credit_grant_ledger_entry_id IS NULL` and no payment grant ledger exists. |
| Refund pending/refunded | Count and amount of refund states. |

### Recharge Detail Table

The recharge detail page should list:

- Order number.
- User.
- Organization.
- Package.
- Credits.
- Amount and currency.
- Payment provider.
- Payment intent.
- Order status.
- Paid at.
- Credit grant ledger entry.
- Risk state.

Filters:

- Date range.
- User keyword.
- Organization.
- Payment provider.
- Order status.
- Currency.
- Has credit grant / missing credit grant.
- Risk type.

### Recharge SQL Shape

Conceptual query:

```sql
SELECT
  date_trunc('day', bo.paid_at AT TIME ZONE 'Asia/Shanghai') AS day,
  bo.currency,
  count(*) AS paid_order_count,
  sum(bo.amount_minor) AS paid_amount_minor,
  sum(bo.credits) AS ordered_credits,
  count(DISTINCT bo.organization_id) AS paying_organization_count,
  count(DISTINCT bo.created_by_user_id) AS paying_user_count,
  count(*) FILTER (
    WHERE bo.credit_grant_ledger_entry_id IS NULL
  ) AS paid_without_credit_count
FROM billing_orders bo
WHERE bo.status = 'paid'
  AND bo.paid_at >= $1
  AND bo.paid_at < $2
GROUP BY day, bo.currency
ORDER BY day DESC;
```

Credit grant should be cross-checked against `credit_ledger_entries`:

```sql
SELECT
  date_trunc('day', cle.created_at AT TIME ZONE 'Asia/Shanghai') AS day,
  cle.organization_id,
  sum(cle.amount) AS granted_credits
FROM credit_ledger_entries cle
WHERE cle.entry_type = 'grant'
  AND cle.source_type = 'payment_order'
  AND cle.created_at >= $1
  AND cle.created_at < $2
GROUP BY day, cle.organization_id;
```

## Credit Consumption Statistics

### Daily Credit Summary

Consumption summary should group ledger facts by day:

| Column | Source / Rule |
| --- | --- |
| Date | `credit_ledger_entries.created_at` day. |
| Reserved credits | Sum `entry_type = 'reservation'`. |
| Consumed credits | Sum `entry_type = 'consume'`. |
| Released credits | Sum `entry_type = 'release'`. |
| Granted credits | Sum `entry_type = 'grant'`. |
| Consuming organizations | Count distinct organizations with consume entries. |
| Consuming users | Count distinct task/user actors where available. |
| Tasks consumed | Count distinct tasks linked to consume entries. |
| Average credits per task | Consumed credits / consumed task count. |

### Consumption Detail Table

The consumption detail page should list:

- Ledger entry ID.
- User / organization.
- Project / episode / task if available.
- Model code.
- Task mode.
- Entry type.
- Amount.
- Available delta.
- Reserved delta.
- Consumed delta.
- Reservation ID.
- Allocation ID.
- Source type and source ID.
- Created at.

Filters:

- Date range.
- User.
- Organization.
- Project.
- Model.
- Media type.
- Task mode.
- Entry type: grant, reservation, consume, release.
- Manual review / abnormal state.

### Consumption SQL Shape

Conceptual daily ledger query:

```sql
SELECT
  date_trunc('day', cle.created_at AT TIME ZONE 'Asia/Shanghai') AS day,
  cle.entry_type,
  sum(cle.amount) AS amount,
  sum(cle.available_delta) AS available_delta,
  sum(cle.reserved_delta) AS reserved_delta,
  sum(cle.consumed_delta) AS consumed_delta,
  count(*) AS ledger_entry_count,
  count(DISTINCT cle.organization_id) AS organization_count
FROM credit_ledger_entries cle
WHERE cle.created_at >= $1
  AND cle.created_at < $2
GROUP BY day, cle.entry_type
ORDER BY day DESC, cle.entry_type ASC;
```

Conceptual task/model breakdown:

```sql
SELECT
  date_trunc('day', cle.created_at AT TIME ZONE 'Asia/Shanghai') AS day,
  snap.model_code,
  snap.media_type,
  snap.task_mode,
  sum(cle.amount) AS consumed_credits,
  count(DISTINCT snap.task_id) AS task_count
FROM credit_ledger_entries cle
JOIN credit_reservation_allocations cra
  ON cra.id = cle.allocation_id
JOIN credit_reservations cr
  ON cr.id = cra.reservation_id
LEFT JOIN ai_generation_task_snapshots snap
  ON snap.credit_reservation_id = cr.id
WHERE cle.entry_type = 'consume'
  AND cle.created_at >= $1
  AND cle.created_at < $2
GROUP BY day, snap.model_code, snap.media_type, snap.task_mode
ORDER BY day DESC, consumed_credits DESC;
```

## User-Level Statistics

The analytics page should support user-level drilldown:

| Metric | Meaning |
| --- | --- |
| Total paid amount | Sum of user's successful orders. |
| Total recharge credits | Sum of paid/manual grants linked to the user's org/member scope. |
| Total consumed credits | Sum consume entries linked to user's tasks or membership scope. |
| Total released credits | Sum releases from user's failed/canceled tasks. |
| Current available credits | Current read model, displayed as current state only. |
| Current reserved credits | Current frozen credits. |
| Top consumed models | Model breakdown for this user. |
| Recent credit ledger | Latest ledger rows. |

Important: if credits are organization-scoped, the page must say "organization consumption attributed to user-created tasks" rather than pretending the user owns the whole organization balance.

## Model-Level Statistics

The admin should show model cost/usage:

- Daily consumed credits by model.
- Daily task count by model.
- Average credits per task by model.
- Success/failure/manual-review count by model.
- Recharge-to-consumption ratio over time.

This connects directly to `docs/architecture/admin-model-configuration-design.md`: model pricing rules should be visible alongside actual consumed credits.

## Charts

Recommended charts:

- Daily paid amount line chart.
- Daily granted credits bar chart.
- Daily consumed credits bar chart.
- Reserved vs consumed vs released stacked bar.
- Top users by recharge.
- Top users by consumption.
- Top models by consumed credits.
- Paid-without-credit count trend.

The static admin page can use mock data and simple CSS/HTML chart blocks. It does not need a charting library for the first version.

## Timezone And Date Rules

Admin reporting should use a configured reporting timezone.

Default:

```text
Asia/Shanghai
```

Rules:

- Daily buckets use reporting timezone, not UTC calendar day.
- Store timestamps in UTC/timestamptz.
- Display the selected timezone in the page header.
- Exports must include timezone metadata.

## Export

Analytics pages should support CSV export in future implementation:

- Daily recharge summary.
- Recharge order detail.
- Daily credit summary.
- Credit ledger detail.
- User-level credit summary.
- Model-level consumption summary.

Exports must mask phone numbers and avoid secrets.

## Permissions

Recommended permissions:

- `admin:analytics:view`
- `admin:analytics:export`
- `admin:analytics:view_revenue`
- `admin:analytics:view_user_credit_detail`
- `admin:analytics:view_payment_risk`

Revenue/cash amount visibility should be separate from credit-only visibility.

## Risk And Reconciliation Panels

The analytics page should include a risk section:

- Paid orders without credit grant.
- Credit grant ledger without paid order.
- Payment amount mismatch.
- Refund requires review.
- Long-running reservations.
- `manual_review_required` credit reservations.
- Balance drift between cached balances and ledger recomputation.

These rows should link to user detail, order detail, or credit reservation review.

## Static Mock Scenarios

The first static analytics page should include:

1. A day with high recharge and normal consumption.
2. A day with high consumption but low recharge.
3. A paid order missing credit grant.
4. A model with unusually high average credits per task.
5. A user with repeated failed tasks and released credits.
6. A manual admin credit grant.

## Non-Goals

- No live database queries in the static page.
- No real exports yet.
- No direct balance mutation.
- No raw phone numbers in mock data.
- No integration with `apps/web`.

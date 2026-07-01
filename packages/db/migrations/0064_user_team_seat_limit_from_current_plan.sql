WITH latest_paid_membership_order AS (
  SELECT DISTINCT ON (bo.created_by_user_id)
    bo.created_by_user_id AS user_id,
    bo.id AS order_id,
    mp.seat_limit
  FROM billing_orders bo
  JOIN membership_plans mp
    ON mp.id = bo.membership_plan_id
  WHERE bo.product_type = 'membership_plan'
    AND bo.status = 'paid'
    AND bo.paid_at IS NOT NULL
  ORDER BY bo.created_by_user_id, bo.paid_at DESC, bo.created_at DESC
)
UPDATE users u
SET team_seat_limit = latest.seat_limit
FROM latest_paid_membership_order latest
WHERE u.id = latest.user_id
  AND u.team_seat_limit <> latest.seat_limit;

WITH latest_paid_membership_order AS (
  SELECT DISTINCT ON (bo.created_by_user_id)
    bo.id AS order_id,
    mp.seat_limit
  FROM billing_orders bo
  JOIN membership_plans mp
    ON mp.id = bo.membership_plan_id
  WHERE bo.product_type = 'membership_plan'
    AND bo.status = 'paid'
    AND bo.paid_at IS NOT NULL
  ORDER BY bo.created_by_user_id, bo.paid_at DESC, bo.created_at DESC
)
UPDATE membership_periods period
SET plan_snapshot_json = jsonb_set(
      period.plan_snapshot_json,
      '{seatLimit}',
      to_jsonb(latest.seat_limit),
      true
    ),
    updated_at = now()
FROM latest_paid_membership_order latest
WHERE period.order_id = latest.order_id
  AND (period.plan_snapshot_json ->> 'seatLimit')::integer <> latest.seat_limit;

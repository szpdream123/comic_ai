ALTER TABLE membership_plans
  DROP CONSTRAINT IF EXISTS membership_plans_seat_limit_check,
  ADD CONSTRAINT membership_plans_seat_limit_check
    CHECK (seat_limit >= 0);

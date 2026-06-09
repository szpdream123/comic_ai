export function addMembershipDuration(start: Date, unit: string, count: number): Date {
  const next = new Date(start);
  if (unit === "day") {
    next.setUTCDate(next.getUTCDate() + count);
  } else if (unit === "month") {
    next.setUTCMonth(next.getUTCMonth() + count);
  } else if (unit === "quarter") {
    next.setUTCMonth(next.getUTCMonth() + count * 3);
  } else if (unit === "year") {
    next.setUTCFullYear(next.getUTCFullYear() + count);
  } else {
    throw new Error("unsupported_membership_period_unit");
  }
  return next;
}

export function calculateMembershipWindow(input: {
  paidAt: Date;
  currentPeriodEndAt: Date | null;
  periodUnit: string;
  periodCount: number;
}) {
  const base =
    input.currentPeriodEndAt && input.currentPeriodEndAt > input.paidAt
      ? input.currentPeriodEndAt
      : input.paidAt;

  return {
    periodStartAt: base,
    periodEndAt: addMembershipDuration(base, input.periodUnit, input.periodCount),
  };
}

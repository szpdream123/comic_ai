export function addMembershipDuration(start: Date, unit: string, count: number): Date {
  if (unit === "day") {
    const next = new Date(start);
    next.setUTCDate(next.getUTCDate() + count);
    return next;
  }
  if (unit === "month") {
    return addUtcCalendarMonths(start, count);
  }
  if (unit === "quarter") {
    return addUtcCalendarMonths(start, count * 3);
  }
  if (unit === "year") {
    return addUtcCalendarMonths(start, count * 12);
  }

  throw new Error("unsupported_membership_period_unit");
}

function addUtcCalendarMonths(start: Date, monthCount: number): Date {
  const targetMonthIndex = start.getUTCMonth() + monthCount;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const targetMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(start.getUTCDate(), lastTargetDay);

  return new Date(Date.UTC(
    targetYear,
    targetMonth,
    targetDay,
    start.getUTCHours(),
    start.getUTCMinutes(),
    start.getUTCSeconds(),
    start.getUTCMilliseconds(),
  ));
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

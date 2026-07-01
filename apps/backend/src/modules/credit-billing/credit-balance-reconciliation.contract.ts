export interface CreditLedgerEntryLike {
  userId: string;
  availableDelta: number;
  reservedDelta: number;
  consumedDelta: number;
}

export interface CreditBalanceReadModelLike {
  userId: string;
  creditBalanceCached: number;
  creditReservedCached: number;
  creditFrozenCached?: number;
}

export interface RecomputedCreditBalance {
  userId: string;
  available: number;
  reserved: number;
  consumed: number;
  frozen?: number;
}

export function recomputeCreditBalance(
  ledgerEntries: CreditLedgerEntryLike[],
): Map<string, RecomputedCreditBalance> {
  const balances = new Map<string, RecomputedCreditBalance>();

  for (const entry of ledgerEntries) {
    const current =
      balances.get(entry.userId) ??
      {
        userId: entry.userId,
        available: 0,
        reserved: 0,
        consumed: 0,
      };

    current.available += entry.availableDelta;
    current.reserved += entry.reservedDelta;
    current.consumed += entry.consumedDelta;
    balances.set(entry.userId, current);
  }

  return balances;
}

export function findCreditBalanceDrift(
  ledgerEntries: CreditLedgerEntryLike[],
  readModels: CreditBalanceReadModelLike[],
): RecomputedCreditBalance[] {
  const recomputed = recomputeCreditBalance(ledgerEntries);
  const drift: RecomputedCreditBalance[] = [];

  for (const readModel of readModels) {
    const balance =
      recomputed.get(readModel.userId) ??
      {
        userId: readModel.userId,
        available: 0,
        reserved: 0,
        consumed: 0,
      };

    if (
      balance.available !== readModel.creditBalanceCached ||
      balance.reserved !== readModel.creditReservedCached
    ) {
      drift.push(balance);
    }
  }

  return drift;
}

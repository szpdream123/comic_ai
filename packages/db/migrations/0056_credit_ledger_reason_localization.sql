UPDATE credit_ledger_entries
SET reason = CASE lower(trim(reason))
  WHEN 'membership period gifted credits' THEN '会员赠送积分'
  WHEN 'wallet freeze removed and credits released' THEN '会员续费解冻积分'
  WHEN 'membership lapsed wallet frozen' THEN '会员到期冻结积分'
  WHEN 'membership frozen credits expired' THEN '会员冻结积分过期失效'
  WHEN 'credit lot expired' THEN '积分批次过期失效'
  ELSE reason
END
WHERE reason IS NOT NULL
  AND lower(trim(reason)) IN (
    'membership period gifted credits',
    'wallet freeze removed and credits released',
    'membership lapsed wallet frozen',
    'membership frozen credits expired',
    'credit lot expired'
  );

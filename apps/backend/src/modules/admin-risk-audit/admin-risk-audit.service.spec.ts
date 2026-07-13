import assert from "node:assert/strict";
import { test } from "node:test";

import { createMigratedTestDb } from "../shared/db/test-db.ts";
import { createAdminRiskAuditService } from "./admin-risk-audit.service.ts";

test("admin risk audit service filters payment risks by status", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminRiskAuditService({ db });

  try {



    await db.query(
      `
        INSERT INTO payment_risk_events (
          id,
          risk_type,
          severity,
          decision,
          status,
          metadata_json,
          created_at,
          updated_at
        ) VALUES
          (
            '83000000-0000-4000-8000-000000001001',
            'amount_mismatch',
            'critical',
            'manual_review',
            'open',
            '{"orderNo":"PAY-FILTER-OPEN"}'::jsonb,
            '2026-06-04T09:00:00.000Z',
            '2026-06-04T09:00:00.000Z'
          ),
          (
            '83000000-0000-4000-8000-000000001002',
            'amount_mismatch',
            'warning',
            'allow',
            'reviewed',
            '{"orderNo":"PAY-FILTER-REVIEWED"}'::jsonb,
            '2026-06-04T10:00:00.000Z',
            '2026-06-04T10:00:00.000Z'
          )
      `,
    );

    const all = await service.listRisks({
    });
    const reviewed = await service.listRisks({
      riskStatus: "reviewed",
    });

    assert.deepEqual(
      all.data.risks.map((risk) => ({ id: risk.id, status: risk.status })),
      [
        { id: "83000000-0000-4000-8000-000000001001", status: "open" },
        { id: "83000000-0000-4000-8000-000000001002", status: "reviewed" },
      ],
    );
    assert.deepEqual(
      reviewed.data.risks.map((risk) => ({ id: risk.id, status: risk.status })),
      [{ id: "83000000-0000-4000-8000-000000001002", status: "reviewed" }],
    );
  } finally {
    await db.close();
  }
});

test("admin risk audit service excludes membership orders from paid-without-credit issues", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminRiskAuditService({ db });

  try {
    await db.query(
      `
        INSERT INTO users (id, phone_e164, status)
        VALUES ('00000000-0000-4000-8000-000000009001', '13800139001', 'active')
      `,
    );


    await db.query(
      `
        INSERT INTO membership_plans (
          id,
          code,
          display_name,
          tier,
          period_unit,
          period_count,
          amount_minor,
          gift_credits,
          seat_limit,
          status
        )
        VALUES (
          '91000000-0000-4000-8000-000000009001',
          'risk_membership',
          'Risk Membership',
          'professional',
          'month',
          1,
          19900,
          10,
          5,
          'active'
        )
      `,
    );
    await db.query(
      `
        INSERT INTO billing_orders (
        id,
        created_by_user_id,
        order_no,
        product_type,
        membership_plan_id,
        package_snapshot_json,
        product_snapshot_json,
        credits,
        amount_minor,
        currency,
        status,
        expires_at,
        paid_at,
        successful_payment_intent_id
      )
        VALUES ('92000000-0000-4000-8000-000000009001', '00000000-0000-4000-8000-000000009001', 'ORD-RISK-MEMBERSHIP-1', 'membership_plan', '91000000-0000-4000-8000-000000009001', '{}'::jsonb, '{"code":"risk_membership","giftCredits":10}'::jsonb, 10, 19900, 'CNY', 'paid', '2026-06-05T00:00:00.000Z', '2026-06-04T12:00:00.000Z', '93000000-0000-4000-8000-000000009001')
      `,
    );

    const result = await service.listRisks({
    });

    assert.deepEqual(result.data.paymentIssues, []);
  } finally {
    await db.close();
  }
});

test("admin risk review records the independent admin actor", async () => {
  const db = await createMigratedTestDb();
  const service = createAdminRiskAuditService({ db });
  const adminAccountId = "84000000-0000-4000-8000-000000001001";
  const riskId = "83000000-0000-4000-8000-000000001003";

  try {
    await db.query(
      `
        INSERT INTO admin_accounts (
          id, login_name, password_hash, display_name, status
        )
        VALUES ($1, 'risk_reviewer', 'plain:test', 'Risk Reviewer', 'active')
      `,
      [adminAccountId],
    );
    await db.query(
      `
        INSERT INTO payment_risk_events (
          id, risk_type, severity, decision, status, metadata_json, created_at, updated_at
        )
        VALUES (
          $1, 'amount_mismatch', 'critical', 'manual_review', 'open', '{}'::jsonb,
          '2026-06-04T11:00:00.000Z', '2026-06-04T11:00:00.000Z'
        )
      `,
      [riskId],
    );

    const result = await service.reviewPaymentRisk({
      riskId,
      reason: "verified payment evidence",
      idempotencyKey: "risk-review-independent-admin",
      actorAdminAccountId: adminAccountId,
      now: new Date("2026-06-04T12:00:00.000Z"),
    });
    assert.equal(result.status, 200);

    const risk = await db.query<{
      reviewed_by_admin_account_id: string | null;
    }>(
      "SELECT reviewed_by_admin_account_id FROM payment_risk_events WHERE id = $1",
      [riskId],
    );
    const audit = await db.query<{
      actor_user_id: string | null;
      actor_admin_account_id: string | null;
    }>(
      "SELECT actor_user_id, actor_admin_account_id FROM audit_events WHERE event_type = 'admin.risk.reviewed' AND target_id = $1",
      [riskId],
    );
    const listed = await service.listAuditEvents({ pageSize: 20 });
    const listedRiskAudit = listed.data.find((event) => event.targetId === riskId);

    assert.equal(risk.rows[0]?.reviewed_by_admin_account_id, adminAccountId);
    assert.deepEqual(audit.rows, [{
      actor_user_id: null,
      actor_admin_account_id: adminAccountId,
    }]);
    assert.equal(listedRiskAudit?.actorUserId, null);
    assert.equal(listedRiskAudit?.actorAdminAccountId, adminAccountId);
  } finally {
    await db.close();
  }
});

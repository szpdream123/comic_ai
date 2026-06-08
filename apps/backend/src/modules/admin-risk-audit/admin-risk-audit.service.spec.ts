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
        INSERT INTO organizations (id, name, status)
        VALUES ('10000000-0000-4000-8000-000000000001', 'Risk Filter Org', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES (
          '20000000-0000-4000-8000-000000000001',
          '10000000-0000-4000-8000-000000000001',
          'Risk Filter Workspace',
          'active'
        )
      `,
    );

    await db.query(
      `
        INSERT INTO payment_risk_events (
          id,
          organization_id,
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
            '10000000-0000-4000-8000-000000000001',
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
            '10000000-0000-4000-8000-000000000001',
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
      organizationId: "10000000-0000-4000-8000-000000000001",
      workspaceId: "20000000-0000-4000-8000-000000000001",
    });
    const reviewed = await service.listRisks({
      organizationId: "10000000-0000-4000-8000-000000000001",
      workspaceId: "20000000-0000-4000-8000-000000000001",
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
        VALUES ('00000000-0000-4000-8000-000000009001', '+8613800139001', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO organizations (id, name, status)
        VALUES ('10000000-0000-4000-8000-000000009001', 'Risk Membership Org', 'active')
      `,
    );
    await db.query(
      `
        INSERT INTO workspaces (id, organization_id, name, status)
        VALUES (
          '20000000-0000-4000-8000-000000009001',
          '10000000-0000-4000-8000-000000009001',
          'Risk Membership Workspace',
          'active'
        )
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
          organization_id,
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
        VALUES (
          '92000000-0000-4000-8000-000000009001',
          '10000000-0000-4000-8000-000000009001',
          '00000000-0000-4000-8000-000000009001',
          'ORD-RISK-MEMBERSHIP-1',
          'membership_plan',
          '91000000-0000-4000-8000-000000009001',
          '{}'::jsonb,
          '{"code":"risk_membership","giftCredits":10}'::jsonb,
          10,
          19900,
          'CNY',
          'paid',
          '2026-06-05T00:00:00.000Z',
          '2026-06-04T12:00:00.000Z',
          '93000000-0000-4000-8000-000000009001'
        )
      `,
    );

    const result = await service.listRisks({
      organizationId: "10000000-0000-4000-8000-000000009001",
      workspaceId: "20000000-0000-4000-8000-000000009001",
    });

    assert.deepEqual(result.data.paymentIssues, []);
  } finally {
    await db.close();
  }
});

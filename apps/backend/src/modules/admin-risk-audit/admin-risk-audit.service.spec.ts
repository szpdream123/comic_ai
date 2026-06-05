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

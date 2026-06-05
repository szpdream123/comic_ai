import { createHash } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import {
  grantCredits,
  reserveCredits,
  settleReservationAllocation,
} from "../credit-billing/credit-ledger.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export interface AdminUserListItem {
  userId: string;
  displayName: string;
  phone: string | null;
  email: string | null;
  status: string;
  organizationId: string | null;
  organizationName: string | null;
  workspaceId: string | null;
  membershipId: string | null;
  membershipRole: string | null;
  accountType: "owner_account" | "team_permission_account" | "subaccount" | "user";
  teamRole: string | null;
  teamGroupId: string | null;
  teamGroupName: string | null;
  availableCredits: number;
  reservedCredits: number;
  usedCredits: number;
  subaccountCount: number;
}

interface AdminUserRow {
  user_id: string;
  display_name: string | null;
  phone_e164: string | null;
  email: string | null;
  user_status: string;
  organization_id: string | null;
  organization_name: string | null;
  workspace_id: string | null;
  membership_id: string | null;
  membership_role: string | null;
  team_role: string | null;
  team_group_id: string | null;
  team_group_name: string | null;
  organization_credit_balance: number | string | null;
  organization_reserved_balance: number | string | null;
  member_credit_balance: number | string | null;
  member_credit_used: number | string | null;
  workspace_reserved_credits: number | string | null;
  subaccount_count: number | string | null;
}

export function createAdminUserService(deps: { db: SqlDatabase }) {
  async function listUsers(input: {
    keyword?: string | null;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;
    const params: unknown[] = [];
    const filters: string[] = [];
    const keyword = input.keyword?.trim();
    if (keyword) {
      params.push(`%${keyword}%`);
      filters.push(`(
        u.id::text ILIKE $${params.length}
        OR COALESCE(u.display_name, '') ILIKE $${params.length}
        OR COALESCE(u.phone_e164, '') ILIKE $${params.length}
        OR COALESCE(u.email, '') ILIKE $${params.length}
        OR COALESCE(o.name, '') ILIKE $${params.length}
        OR COALESCE(tp.display_name, '') ILIKE $${params.length}
      )`);
    }
    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const total = await deps.db.query<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM users u
        LEFT JOIN memberships m ON m.user_id = u.id
        LEFT JOIN organizations o ON o.id = m.organization_id
        LEFT JOIN team_member_profiles tp ON tp.membership_id = m.id
        ${whereSql}
      `,
      params,
    );
    const result = await deps.db.query<AdminUserRow>(
      `
        SELECT
          u.id AS user_id,
          u.display_name,
          u.phone_e164,
          u.email,
          u.status AS user_status,
          o.id AS organization_id,
          o.name AS organization_name,
          w.id AS workspace_id,
          m.id AS membership_id,
          m.role AS membership_role,
          tp.business_role AS team_role,
          tg.id AS team_group_id,
          tg.name AS team_group_name,
          o.credit_balance_cached AS organization_credit_balance,
          o.credit_reserved_cached AS organization_reserved_balance,
          tp.credit_balance_cached AS member_credit_balance,
          tp.credit_used_cached AS member_credit_used,
          COALESCE((
            SELECT SUM(r.amount_reserved)
            FROM credit_reservations r
            WHERE r.organization_id = o.id
              AND (w.id IS NULL OR r.workspace_id = w.id)
              AND r.status = 'active'
          ), 0) AS workspace_reserved_credits,
          COALESCE((
            SELECT COUNT(*)
            FROM team_member_profiles child
            WHERE child.organization_id = tp.organization_id
              AND child.workspace_id = tp.workspace_id
              AND child.member_group_id = tp.member_group_id
              AND child.membership_id <> tp.membership_id
              AND tp.business_role IN ('admin', 'group_admin')
          ), 0) AS subaccount_count
        FROM users u
        LEFT JOIN memberships m ON m.user_id = u.id
        LEFT JOIN organizations o ON o.id = m.organization_id
        LEFT JOIN workspaces w ON w.id = m.workspace_id
        LEFT JOIN team_member_profiles tp ON tp.membership_id = m.id
        LEFT JOIN team_member_groups tg ON tg.id = tp.member_group_id
        ${whereSql}
        ORDER BY u.created_at DESC, u.id ASC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, pageSize, offset],
    );

    return {
      data: result.rows.map(userFromRow),
      meta: {
        page,
        pageSize,
        total: Number(total.rows[0]?.count ?? 0),
      },
    };
  }

  async function listSubaccounts(input: { userId: string }) {
    const result = await deps.db.query<AdminUserRow>(
      `
        WITH parent AS (
          SELECT tp.organization_id, tp.workspace_id, tp.member_group_id
          FROM users u
          JOIN memberships m ON m.user_id = u.id
          JOIN team_member_profiles tp ON tp.membership_id = m.id
          WHERE u.id = $1
            AND tp.business_role IN ('admin', 'group_admin')
          LIMIT 1
        )
        SELECT
          u.id AS user_id,
          u.display_name,
          u.phone_e164,
          u.email,
          u.status AS user_status,
          o.id AS organization_id,
          o.name AS organization_name,
          w.id AS workspace_id,
          m.id AS membership_id,
          m.role AS membership_role,
          tp.business_role AS team_role,
          tg.id AS team_group_id,
          tg.name AS team_group_name,
          o.credit_balance_cached AS organization_credit_balance,
          o.credit_reserved_cached AS organization_reserved_balance,
          tp.credit_balance_cached AS member_credit_balance,
          tp.credit_used_cached AS member_credit_used,
          0 AS workspace_reserved_credits,
          0 AS subaccount_count
        FROM parent p
        JOIN team_member_profiles tp
          ON tp.organization_id = p.organization_id
          AND tp.workspace_id = p.workspace_id
          AND tp.member_group_id = p.member_group_id
          AND tp.business_role NOT IN ('admin', 'group_admin')
        JOIN memberships m ON m.id = tp.membership_id
        JOIN users u ON u.id = m.user_id
        JOIN organizations o ON o.id = m.organization_id
        JOIN workspaces w ON w.id = m.workspace_id
        LEFT JOIN team_member_groups tg ON tg.id = tp.member_group_id
        ORDER BY tp.created_at DESC
      `,
      [input.userId],
    );

    return {
      data: result.rows.map(userFromRow),
      meta: {
        total: result.rows.length,
      },
    };
  }

  async function listTeamPermissionAccounts(input: {
    keyword?: string | null;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
    const offset = (page - 1) * pageSize;
    const params: unknown[] = [];
    const filters = ["tp.business_role IN ('admin', 'group_admin')"];
    const keyword = input.keyword?.trim();
    if (keyword) {
      params.push(`%${keyword}%`);
      filters.push(`(
        u.id::text ILIKE $${params.length}
        OR COALESCE(u.display_name, '') ILIKE $${params.length}
        OR COALESCE(u.phone_e164, '') ILIKE $${params.length}
        OR COALESCE(u.email, '') ILIKE $${params.length}
        OR COALESCE(o.name, '') ILIKE $${params.length}
        OR COALESCE(tp.display_name, '') ILIKE $${params.length}
        OR COALESCE(tg.name, '') ILIKE $${params.length}
      )`);
    }
    const whereSql = `WHERE ${filters.join(" AND ")}`;

    const total = await deps.db.query<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM users u
        JOIN memberships m ON m.user_id = u.id
        JOIN organizations o ON o.id = m.organization_id
        JOIN team_member_profiles tp ON tp.membership_id = m.id
        LEFT JOIN team_member_groups tg ON tg.id = tp.member_group_id
        ${whereSql}
      `,
      params,
    );
    const result = await deps.db.query<AdminUserRow>(
      `
        SELECT
          u.id AS user_id,
          u.display_name,
          u.phone_e164,
          u.email,
          u.status AS user_status,
          o.id AS organization_id,
          o.name AS organization_name,
          w.id AS workspace_id,
          m.id AS membership_id,
          m.role AS membership_role,
          tp.business_role AS team_role,
          tg.id AS team_group_id,
          tg.name AS team_group_name,
          o.credit_balance_cached AS organization_credit_balance,
          o.credit_reserved_cached AS organization_reserved_balance,
          tp.credit_balance_cached AS member_credit_balance,
          tp.credit_used_cached AS member_credit_used,
          COALESCE((
            SELECT SUM(r.amount_reserved)
            FROM credit_reservations r
            WHERE r.organization_id = o.id
              AND (w.id IS NULL OR r.workspace_id = w.id)
              AND r.status = 'active'
          ), 0) AS workspace_reserved_credits,
          COALESCE((
            SELECT COUNT(*)
            FROM team_member_profiles child
            WHERE child.organization_id = tp.organization_id
              AND child.workspace_id = tp.workspace_id
              AND child.member_group_id = tp.member_group_id
              AND child.membership_id <> tp.membership_id
              AND child.business_role NOT IN ('admin', 'group_admin')
          ), 0) AS subaccount_count
        FROM users u
        JOIN memberships m ON m.user_id = u.id
        JOIN organizations o ON o.id = m.organization_id
        JOIN workspaces w ON w.id = m.workspace_id
        JOIN team_member_profiles tp ON tp.membership_id = m.id
        LEFT JOIN team_member_groups tg ON tg.id = tp.member_group_id
        ${whereSql}
        ORDER BY tp.created_at DESC, u.id ASC
        LIMIT $${params.length + 1}
        OFFSET $${params.length + 2}
      `,
      [...params, pageSize, offset],
    );

    return {
      data: result.rows.map(userFromRow),
      meta: {
        page,
        pageSize,
        total: Number(total.rows[0]?.count ?? 0),
      },
    };
  }

  async function grantUserCredits(input: {
    userId: string;
    amount: number;
    reason: string;
    workOrderNo?: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return {
        status: 400,
        body: { error: { code: "invalid_credit_amount", message: "积分数量必须是正整数" } },
      };
    }

    const reason = input.reason.trim();
    if (!reason) {
      return {
        status: 400,
        body: { error: { code: "reason_required", message: "请填写操作原因" } },
      };
    }
    const workOrderNo = normalizeWorkOrderNo(input.workOrderNo);
    if (!workOrderNo) {
      return {
        status: 400,
        body: { error: { code: "invalid_work_order_no", message: "请填写有效工单号，例如 CS-20260605-001" } },
      };
    }

    const target = await findUserCreditTarget(deps.db, input.userId);
    if (!target) {
      return {
        status: 404,
        body: { error: { code: "admin_user_not_found", message: "用户不存在" } },
      };
    }

    const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
    const existingLedger = await queryOne<{ id: string }>(
      deps.db,
      `
        SELECT id
        FROM credit_ledger_entries
        WHERE organization_id = $1
          AND source_type = 'admin_manual_grant'
          AND source_id = $2
          AND entry_type = 'grant'
        LIMIT 1
      `,
      [target.organizationId, sourceId],
    );

    const ledger = await grantCredits(deps.db, {
      organizationId: target.organizationId,
      amount,
      sourceType: "admin_manual_grant",
      sourceId,
      reason,
      metadata: {
        targetUserId: input.userId,
        targetMembershipId: target.membershipId,
        actorAdminAccountId: input.actorAdminAccountId,
        workOrderNo,
      },
      createdByUserId: null,
      now: input.now,
    });

    if (target.teamProfileId && !existingLedger) {
      await deps.db.query(
        `
          UPDATE team_member_profiles
          SET credit_balance_cached = credit_balance_cached + $2,
              updated_at = $3
          WHERE id = $1
        `,
        [target.teamProfileId, amount, input.now],
      );
      await deps.db.query(
        `
          INSERT INTO team_credit_adjustments (
            id,
            organization_id,
            workspace_id,
            operator_user_id,
            target_membership_id,
            adjustment_type,
            amount,
            reason,
            created_at
          )
          VALUES ($1, $2, $3, $4, $5, 'allocate', $6, $7, $8)
        `,
        [
          uuidFromIdempotencyKey(`${input.idempotencyKey}:team-adjustment`),
          target.organizationId,
          target.workspaceId,
          target.createdByUserId,
          target.membershipId,
          amount,
          reason,
          input.now,
        ],
      );
    }

    if (!existingLedger) {
      await appendAuditEvent(deps.db, {
        organizationId: input.auditOrganizationId,
        workspaceId: input.auditWorkspaceId,
        actorUserId: null,
        eventType: "admin.credit.granted",
        targetType: "user",
        targetId: input.userId,
        reason,
        sensitive: true,
        metadata: {
          amount,
          ledgerEntryId: ledger.id,
          workOrderNo,
          targetOrganizationId: target.organizationId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
        },
      });
    }

    const organization = await queryOne<{
      credit_balance_cached: number | string;
      credit_reserved_cached: number | string;
    }>(
      deps.db,
      `
        SELECT credit_balance_cached, credit_reserved_cached
        FROM organizations
        WHERE id = $1
      `,
      [target.organizationId],
    );
    const memberProfile = target.teamProfileId
      ? await queryOne<{ credit_balance_cached: number | string }>(
          deps.db,
          "SELECT credit_balance_cached FROM team_member_profiles WHERE id = $1",
          [target.teamProfileId],
        )
      : null;

    return {
      status: 200,
      body: {
        data: {
          ledgerEntryId: ledger.id,
          amount,
          availableCredits: Number(
            memberProfile?.credit_balance_cached ??
              organization?.credit_balance_cached ??
              0,
          ),
          reservedCredits: Number(organization?.credit_reserved_cached ?? 0),
        },
      },
    };
  }

  async function updateUserProfile(input: {
    userId: string;
    displayName?: string;
    email?: string | null;
    reason: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const existing = await queryOne<{ id: string; display_name: string | null; email: string | null }>(
      deps.db,
      "SELECT id, display_name, email FROM users WHERE id = $1",
      [input.userId],
    );
    if (!existing) return error(404, "admin_user_not_found", "用户不存在");
    const displayName = input.displayName?.trim() || existing.display_name || null;
    const email = input.email === undefined ? existing.email : input.email?.trim() || null;
    const row = await queryOne<{ id: string; display_name: string | null; email: string | null; status: string }>(
      deps.db,
      `
        UPDATE users
        SET display_name = $2,
            email = $3,
            updated_at = $4
        WHERE id = $1
        RETURNING id, display_name, email, status
      `,
      [input.userId, displayName, email, input.now],
    );
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType: "admin.user.profile_updated",
      targetType: "user",
      targetId: input.userId,
      reason,
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        before: { displayName: existing.display_name, email: maskEmail(existing.email) },
        after: { displayName, email: maskEmail(email) },
      },
    });
    return {
      status: 200,
      body: {
        data: {
          userId: row!.id,
          displayName: row!.display_name ?? "未命名用户",
          email: maskEmail(row!.email),
          status: row!.status,
        },
      },
    };
  }

  async function revealUserContact(input: {
    userId: string;
    reason: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "璇峰～鍐欐搷浣滃師鍥?");
    const user = await queryOne<{
      id: string;
      phone_e164: string | null;
      email: string | null;
    }>(
      deps.db,
      "SELECT id, phone_e164, email FROM users WHERE id = $1",
      [input.userId],
    );
    if (!user) return error(404, "admin_user_not_found", "鐢ㄦ埛涓嶅瓨鍦?");

    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType: "admin.user.contact_revealed",
      targetType: "user",
      targetId: input.userId,
      reason,
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        maskedContact: {
          phone: maskPhone(user.phone_e164),
          email: maskEmail(user.email),
        },
      },
    });

    return {
      status: 200,
      body: {
        data: {
          userId: user.id,
          contact: {
            phone: user.phone_e164,
            email: user.email,
          },
        },
      },
    };
  }

  async function updateUserStatus(input: {
    userId: string;
    status: string;
    reason: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    if (!["active", "disabled", "archived"].includes(input.status)) {
      return error(400, "invalid_user_status", "用户状态不支持");
    }
    const existing = await queryOne<{ id: string; status: string }>(
      deps.db,
      "SELECT id, status FROM users WHERE id = $1",
      [input.userId],
    );
    if (!existing) return error(404, "admin_user_not_found", "用户不存在");
    const row = await queryOne<{ id: string; status: string }>(
      deps.db,
      "UPDATE users SET status = $2, updated_at = $3 WHERE id = $1 RETURNING id, status",
      [input.userId, input.status, input.now],
    );
    await deps.db.query(
      "UPDATE memberships SET status = $2, updated_at = $3 WHERE user_id = $1",
      [input.userId, input.status, input.now],
    );
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType: "admin.user.status_changed",
      targetType: "user",
      targetId: input.userId,
      reason,
      sensitive: true,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        before: { status: existing.status },
        after: { status: input.status },
      },
    });
    return { status: 200, body: { data: { userId: row!.id, status: row!.status } } };
  }

  async function deductUserCredits(input: {
    userId: string;
    amount: number;
    reason: string;
    workOrderNo?: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount <= 0) {
      return error(400, "invalid_credit_amount", "积分数量必须是正整数");
    }
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const workOrderNo = normalizeWorkOrderNo(input.workOrderNo);
    if (!workOrderNo) return error(400, "invalid_work_order_no", "请填写有效工单号，例如 CS-20260605-001");
    const target = await findUserCreditTarget(deps.db, input.userId);
    if (!target) return error(404, "admin_user_not_found", "用户不存在");
    const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
    const existingLedger = await queryOne<LedgerRow>(
      deps.db,
      `
        SELECT *
        FROM credit_ledger_entries
        WHERE organization_id = $1
          AND source_type = 'admin_manual_deduct'
          AND source_id = $2
          AND entry_type = 'reservation'
        LIMIT 1
      `,
      [target.organizationId, sourceId],
    );

    let ledger = existingLedger;
    if (!existingLedger) {
      const reservation = await reserveCredits(deps.db, {
        organizationId: target.organizationId,
        workspaceId: target.workspaceId,
        amount,
        sourceType: "admin_manual_deduct",
        sourceId,
        reason,
        metadata: {
          targetUserId: input.userId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
          workOrderNo,
        },
        createdByUserId: null,
        now: input.now,
      });
      const settlement = await settleReservationAllocation(deps.db, {
        reservationId: reservation.reservation.id,
        allocationKey: "admin_manual_deduct",
        amount,
        outcome: "consumed",
        metadata: {
          targetUserId: input.userId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
          workOrderNo,
        },
        now: input.now,
      });
      ledger = await queryOne<LedgerRow>(
        deps.db,
        "SELECT * FROM credit_ledger_entries WHERE id = $1",
        [reservation.ledgerEntry.id],
      );
      if (target.teamProfileId) {
        await deps.db.query(
          "UPDATE team_member_profiles SET credit_balance_cached = credit_balance_cached - $2, updated_at = $3 WHERE id = $1",
          [target.teamProfileId, amount, input.now],
        );
      }
      await appendAuditEvent(deps.db, {
        organizationId: input.auditOrganizationId,
        workspaceId: input.auditWorkspaceId,
        actorUserId: null,
        eventType: "admin.credit.deducted",
        targetType: "user",
        targetId: input.userId,
        reason,
        sensitive: true,
        metadata: {
          amount,
          ledgerEntryId: settlement.ledgerEntry?.id ?? ledger!.id,
          workOrderNo,
          targetOrganizationId: target.organizationId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
        },
      });
    }

    const organization = await queryOne<{ credit_balance_cached: number | string; credit_reserved_cached: number | string }>(
      deps.db,
      "SELECT credit_balance_cached, credit_reserved_cached FROM organizations WHERE id = $1",
      [target.organizationId],
    );
    const memberProfile = target.teamProfileId
      ? await queryOne<{ credit_balance_cached: number | string }>(
          deps.db,
          "SELECT credit_balance_cached FROM team_member_profiles WHERE id = $1",
          [target.teamProfileId],
        )
      : null;
    return {
      status: 200,
      body: {
        data: {
          ledgerEntryId: ledger!.id,
          amount,
          availableCredits: Number(memberProfile?.credit_balance_cached ?? organization?.credit_balance_cached ?? 0),
          reservedCredits: Number(organization?.credit_reserved_cached ?? 0),
        },
      },
    };
  }

  async function listUserCreditLedger(input: { userId: string; pageSize?: number }) {
    const target = await findUserCreditTarget(deps.db, input.userId);
    if (!target) return error(404, "admin_user_not_found", "用户不存在");
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
    const result = await deps.db.query<LedgerRow>(
      `
        SELECT *
        FROM credit_ledger_entries
        WHERE organization_id = $1
          AND (
            metadata_json->>'targetUserId' = $2
            OR source_type IN ('payment_order', 'admin_manual_grant', 'admin_manual_deduct')
          )
        ORDER BY created_at DESC, id ASC
        LIMIT $3
      `,
      [target.organizationId, input.userId, pageSize],
    );
    return { data: result.rows.map(ledgerFromRow), meta: { total: result.rows.length } };
  }

  return {
    listUsers,
    listSubaccounts,
    listTeamPermissionAccounts,
    grantUserCredits,
    revealUserContact,
    updateUserProfile,
    updateUserStatus,
    deductUserCredits,
    listUserCreditLedger,
  };
}

interface UserCreditTargetRow {
  user_id: string;
  organization_id: string;
  workspace_id: string | null;
  membership_id: string;
  team_profile_id: string | null;
  created_by_user_id: string | null;
}

interface LedgerRow {
  id: string;
  organization_id: string;
  entry_type: string;
  amount: number | string;
  available_delta: number | string;
  reserved_delta: number | string;
  consumed_delta: number | string;
  source_type: string;
  source_id: string;
  reason: string;
  metadata_json: unknown;
  created_at: Date | string;
}

async function findUserCreditTarget(db: SqlDatabase, userId: string) {
  const row = await queryOne<UserCreditTargetRow>(
    db,
    `
      SELECT
        u.id AS user_id,
        m.organization_id,
        m.workspace_id,
        m.id AS membership_id,
        tp.id AS team_profile_id,
        tp.created_by_user_id
      FROM users u
      JOIN memberships m ON m.user_id = u.id
      LEFT JOIN team_member_profiles tp ON tp.membership_id = m.id
      WHERE u.id = $1
      ORDER BY
        CASE WHEN m.role = 'owner_admin' THEN 0 ELSE 1 END,
        m.created_at ASC
      LIMIT 1
    `,
    [userId],
  );

  if (!row) {
    return undefined;
  }

  return {
    userId: row.user_id,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    membershipId: row.membership_id,
    teamProfileId: row.team_profile_id,
    createdByUserId: row.created_by_user_id,
  };
}

function userFromRow(row: AdminUserRow): AdminUserListItem {
  const accountType = resolveAccountType(row);
  const memberCredits = row.member_credit_balance;
  return {
    userId: row.user_id,
    displayName: row.display_name ?? "未命名用户",
    phone: maskPhone(row.phone_e164),
    email: maskEmail(row.email),
    status: row.user_status,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    workspaceId: row.workspace_id,
    membershipId: row.membership_id,
    membershipRole: row.membership_role,
    accountType,
    teamRole: row.team_role,
    teamGroupId: row.team_group_id,
    teamGroupName: row.team_group_name,
    availableCredits: Number(
      memberCredits ?? row.organization_credit_balance ?? 0,
    ),
    reservedCredits: accountType === "owner_account"
      ? Number(row.organization_reserved_balance ?? 0)
      : Number(row.workspace_reserved_credits ?? 0),
    usedCredits: Number(row.member_credit_used ?? 0),
    subaccountCount: Number(row.subaccount_count ?? 0),
  };
}

function resolveAccountType(row: AdminUserRow): AdminUserListItem["accountType"] {
  if (row.team_role === "admin" || row.team_role === "group_admin") {
    return "team_permission_account";
  }
  if (row.membership_role === "sub_account" || row.team_role) {
    return "subaccount";
  }
  if (row.membership_role === "owner_admin") {
    return "owner_account";
  }
  return "user";
}

function maskPhone(phone: string | null): string | null {
  if (!phone) {
    return null;
  }
  return phone.replace(/(\+?\d{2,4})\d{4}(\d{4})$/, "$1****$2");
}

function maskEmail(email: string | null): string | null {
  if (!email) {
    return null;
  }
  const [name, domain] = email.split("@");
  if (!name || !domain) {
    return email;
  }
  return `${name.slice(0, 2)}***@${domain}`;
}

function ledgerFromRow(row: LedgerRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    entryType: row.entry_type,
    amount: Number(row.amount),
    availableDelta: Number(row.available_delta),
    reservedDelta: Number(row.reserved_delta),
    consumedDelta: Number(row.consumed_delta),
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    metadata: normalizeJson(row.metadata_json),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function normalizeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function uuidFromIdempotencyKey(key: string): string {
  const hex = createHash("sha256").update(key).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function normalizeWorkOrderNo(value: string | undefined): string {
  const workOrderNo = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2,8}-\d{8}-\d{3,8}$/.test(workOrderNo)) return "";
  return workOrderNo;
}

function error(status: number, code: string, message: string) {
  return { status, body: { error: { code, message } } };
}

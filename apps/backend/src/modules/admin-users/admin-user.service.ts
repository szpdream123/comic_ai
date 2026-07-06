import { createHash } from "node:crypto";

import { appendAuditEvent } from "../audit/audit.service.ts";
import { restoreOrganizationWalletCreditsInTransaction } from "../credit-billing/credit-lot.service.ts";
import {
  grantCredits,
  reserveCredits,
  settleReservationAllocation,
} from "../credit-billing/credit-ledger.service.ts";
import { maskCnPhone, normalizeCnPhone } from "../identity/phone-auth.utils.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

const TEAM_SUBACCOUNT_LIMIT_CONFIG_KEY = "team.default_subaccount_limit";
const DEFAULT_TEAM_SUBACCOUNT_LIMIT = 50;
const PERSONAL_CREDIT_ORGANIZATION_NAME = "Personal Creator Workspace";

export interface AdminUserListItem {
  userId: string;
  inviteCode: string | null;
  displayName: string;
  phone: string | null;
  email: string | null;
  lastLoginAt: string | null;
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
  frozenCredits: number;
  displayCreditBalance: number;
  usedCredits: number;
  subaccountCount: number;
}

export interface AdminTeamPlanLimitSummary {
  organizationId: string;
  organizationName: string;
  defaultSeatLimit: number;
  effectiveSeatLimit: number;
  overrideSeatLimit: number | null;
  limitSource: "default" | "override";
  usedSeats: number;
  remainingSeats: number;
}

export interface AdminUserModelRequestLogItem {
  id: string;
  providerRequestId: string;
  organizationId: string;
  workspaceId: string | null;
  modelType: "text" | "image" | "video";
  modelName: string;
  creditsCost: number;
  providerName: string;
  providerOperation: string;
  modelId: string;
  providerModel: string;
  requestKey: string;
  requestHash: string;
  payloadHash: string;
  payloadSummary: string | null;
  requestBody: Record<string, unknown>;
  requestText: string | null;
  responseText: string | null;
  responseUsage: Record<string, unknown> | null;
  responseFinishReasons: string[];
  status: string;
  failureCode: string | null;
  projectId: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

interface AdminUserRow {
  user_id: string;
  invite_code: string | null;
  display_name: string | null;
  phone_e164: string | null;
  email: string | null;
  last_login_at: Date | string | null;
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
  organization_frozen_balance: number | string | null;
  member_credit_balance: number | string | null;
  member_credit_used: number | string | null;
  workspace_reserved_credits: number | string | null;
  subaccount_count: number | string | null;
}

interface AdminUserModelRequestLogRow {
  id: string;
  provider_request_id: string;
  organization_id: string | null;
  workspace_id: string | null;
  media_type: string | null;
  display_name: string | null;
  credits_cost: number | string | null;
  provider_name: string;
  provider_operation: string;
  model_id: string;
  provider_model: string;
  request_key: string;
  request_hash: string;
  payload_hash: string;
  payload_summary: string | null;
  request_body_json: Record<string, unknown> | null;
  request_text: string | null;
  response_text: string | null;
  response_usage_json: Record<string, unknown> | null;
  response_finish_reasons_json: unknown;
  status: string;
  failure_code: string | null;
  project_id: string | null;
  started_at: Date | string;
  completed_at: Date | string | null;
  created_at: Date | string;
}

export function createAdminUserService(deps: { db: SqlDatabase }) {
  async function listUsers(input: {
    keyword?: string | null;
    page?: number;
    pageSize?: number;
  } = {}) {
    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
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
        OR EXISTS (
          SELECT 1
          FROM memberships membership_search
          LEFT JOIN organizations organization_search
            ON organization_search.id = membership_search.organization_id
          WHERE membership_search.user_id = u.id
            AND COALESCE(organization_search.name, '') ILIKE $${params.length}
        )
        OR EXISTS (
          SELECT 1
          FROM team_members member_search
          WHERE member_search.user_id = u.id
            AND member_search.status <> 'deleted'
            AND (
              COALESCE(member_search.member_name, '') ILIKE $${params.length}
              OR COALESCE(member_search.member_account, '') ILIKE $${params.length}
              OR COALESCE(member_search.member_login_account, '') ILIKE $${params.length}
            )
        )
      )`);
    }
    const whereSql = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const total = await deps.db.query<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM users u
        ${whereSql}
      `,
      params,
    );
    const result = await deps.db.query<AdminUserRow>(
      `
        SELECT
          u.id AS user_id,
          u.invite_code,
          u.display_name,
          u.phone_e164,
          u.email,
          u.last_login_at,
          u.status AS user_status,
          chosen.organization_id,
          chosen.organization_name,
          chosen.workspace_id,
          chosen.membership_id,
          chosen.membership_role,
          chosen.team_role,
          chosen.team_group_id,
          chosen.team_group_name,
          chosen.organization_credit_balance,
          chosen.organization_reserved_balance,
          chosen.organization_frozen_balance,
          chosen.member_credit_balance,
          chosen.member_credit_used,
          COALESCE((
            SELECT SUM(r.amount_reserved)
            FROM credit_reservations r
            WHERE r.organization_id = chosen.organization_id
              AND r.status = 'active'
              AND (
                r.user_id = u.id
                OR r.metadata_json->>'targetUserId' = u.id::text
                OR r.metadata_json->>'targetMembershipId' = chosen.membership_id::text
              )
          ), 0) AS workspace_reserved_credits,
          COALESCE((
            SELECT COUNT(*)
            FROM team_members child
            WHERE child.user_id = u.id
              AND child.status = 'active'
          ), 0) AS subaccount_count
        FROM users u
        LEFT JOIN LATERAL (
          SELECT
            m.id AS membership_id,
            m.organization_id,
            o.name AS organization_name,
            m.workspace_id,
            m.role AS membership_role,
            NULL::text AS team_role,
            NULL::uuid AS team_group_id,
            NULL::text AS team_group_name,
            u.credit_balance_cached AS organization_credit_balance,
            u.credit_reserved_cached AS organization_reserved_balance,
            u.credit_frozen_cached AS organization_frozen_balance,
            NULL::integer AS member_credit_balance,
            0::integer AS member_credit_used
          FROM memberships m
          LEFT JOIN organizations o ON o.id = m.organization_id
          WHERE m.user_id = u.id
          ORDER BY
            CASE
              WHEN m.status = 'active' THEN 0
              ELSE 1
            END,
            CASE
              WHEN o.name = '${PERSONAL_CREDIT_ORGANIZATION_NAME}' AND m.role = 'owner_admin' THEN 0
              WHEN m.role = 'owner_admin' THEN 1
              ELSE 2
            END,
            m.created_at DESC,
            m.id ASC
          LIMIT 1
        ) chosen ON TRUE
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
        WITH owner_scope AS (
          SELECT
            m.organization_id,
            o.name AS organization_name,
            m.workspace_id
          FROM memberships m
          LEFT JOIN organizations o ON o.id = m.organization_id
          WHERE m.user_id = $1
            AND m.status = 'active'
          ORDER BY
            CASE WHEN o.name = '${PERSONAL_CREDIT_ORGANIZATION_NAME}' AND m.role = 'owner_admin' THEN 0 ELSE 1 END,
            CASE WHEN m.role = 'owner_admin' THEN 0 ELSE 1 END,
            m.created_at DESC,
            m.id ASC
          LIMIT 1
        )
        SELECT
          member.id AS user_id,
          NULL::text AS invite_code,
          member.member_name AS display_name,
          NULL::text AS phone_e164,
          NULL::text AS email,
          NULL::timestamptz AS last_login_at,
          member.status AS user_status,
          owner_scope.organization_id,
          owner_scope.organization_name,
          owner_scope.workspace_id,
          member.id AS membership_id,
          'team_member'::text AS membership_role,
          NULL::text AS team_role,
          NULL::uuid AS team_group_id,
          NULL::text AS team_group_name,
          member.member_credits AS organization_credit_balance,
          0::integer AS organization_reserved_balance,
          0::integer AS organization_frozen_balance,
          member.member_credits AS member_credit_balance,
          0::integer AS member_credit_used,
          COALESCE((
            SELECT SUM(r.amount_reserved)
            FROM credit_reservations r
            WHERE r.organization_id = owner_scope.organization_id
              AND r.status = 'active'
              AND (
                r.user_id = member.id
                OR r.metadata_json->>'targetUserId' = member.id::text
                OR r.metadata_json->>'targetMembershipId' = member.id::text
              )
          ), 0) AS workspace_reserved_credits,
          0 AS subaccount_count
        FROM team_members member
        CROSS JOIN owner_scope
        WHERE member.user_id = $1
          AND member.status <> 'deleted'
        ORDER BY member.created_at DESC, member.id ASC
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
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 20)));
    const offset = (page - 1) * pageSize;
    const params: unknown[] = [];
    const filters = ["member.status <> 'deleted'"];
    const keyword = input.keyword?.trim();
    if (keyword) {
      params.push(`%${keyword}%`);
      filters.push(`(
        member.id::text ILIKE $${params.length}
        OR COALESCE(member.member_name, '') ILIKE $${params.length}
        OR COALESCE(member.member_account, '') ILIKE $${params.length}
        OR COALESCE(member.member_login_account, '') ILIKE $${params.length}
        OR COALESCE(owner.display_name, '') ILIKE $${params.length}
        OR COALESCE(owner.phone_e164, '') ILIKE $${params.length}
        OR COALESCE(owner.email, '') ILIKE $${params.length}
        OR COALESCE(o.name, '') ILIKE $${params.length}
      )`);
    }
    const whereSql = `WHERE ${filters.join(" AND ")}`;

    const total = await deps.db.query<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM team_members member
        JOIN users owner ON owner.id = member.user_id
        LEFT JOIN LATERAL (
          SELECT m.organization_id, m.workspace_id
          FROM memberships m
          WHERE m.user_id = owner.id
            AND m.status = 'active'
          ORDER BY
            CASE WHEN m.role = 'owner_admin' THEN 0 ELSE 1 END,
            m.created_at DESC,
            m.id ASC
          LIMIT 1
        ) owner_membership ON TRUE
        LEFT JOIN organizations o ON o.id = owner_membership.organization_id
        ${whereSql}
      `,
      params,
    );
    const result = await deps.db.query<AdminUserRow>(
      `
        SELECT
          member.id AS user_id,
          NULL::text AS invite_code,
          member.member_name AS display_name,
          NULL::text AS phone_e164,
          NULL::text AS email,
          NULL::timestamptz AS last_login_at,
          member.status AS user_status,
          o.id AS organization_id,
          o.name AS organization_name,
          owner_membership.workspace_id,
          member.id AS membership_id,
          'team_member'::text AS membership_role,
          NULL::text AS team_role,
          NULL::uuid AS team_group_id,
          NULL::text AS team_group_name,
          member.member_credits AS organization_credit_balance,
          0::integer AS organization_reserved_balance,
          0::integer AS organization_frozen_balance,
          member.member_credits AS member_credit_balance,
          0::integer AS member_credit_used,
          COALESCE((
            SELECT SUM(r.amount_reserved)
            FROM credit_reservations r
            WHERE r.organization_id = o.id
              AND r.status = 'active'
              AND (
                r.user_id = member.id
                OR r.metadata_json->>'targetUserId' = member.id::text
                OR r.metadata_json->>'targetMembershipId' = member.id::text
              )
          ), 0) AS workspace_reserved_credits,
          0 AS subaccount_count
        FROM team_members member
        JOIN users owner ON owner.id = member.user_id
        LEFT JOIN LATERAL (
          SELECT m.organization_id, m.workspace_id
          FROM memberships m
          WHERE m.user_id = owner.id
            AND m.status = 'active'
          ORDER BY
            CASE WHEN m.role = 'owner_admin' THEN 0 ELSE 1 END,
            m.created_at DESC,
            m.id ASC
          LIMIT 1
        ) owner_membership ON TRUE
        LEFT JOIN organizations o ON o.id = owner_membership.organization_id
        ${whereSql}
        ORDER BY member.created_at DESC, member.id ASC
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
    adjustmentScenario?: string;
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
    const rawWorkOrderNo = String(input.workOrderNo ?? "").trim();
    const workOrderNo = rawWorkOrderNo ? normalizeWorkOrderNo(rawWorkOrderNo) : undefined;
    if (rawWorkOrderNo && !workOrderNo) {
      return {
        status: 400,
        body: { error: { code: "invalid_work_order_no", message: "请填写有效工单号，例如 CS-20260605-001" } },
      };
    }

    const target = await findUserCreditTarget(deps.db, { userId: input.userId });
    if (!target) {
      return {
        status: 404,
        body: { error: { code: "admin_user_not_found", message: "用户不存在" } },
      };
    }
    if (!isWritableCreditTarget(target)) {
      return error(409, "credit_account_not_found", "该用户没有个人积分账户，不能使用共享组织积分");
    }

    if (!isActiveUserStatus(target.status)) {
      return inactiveUserOperationError(target.status);
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
      userId: input.userId,
      amount,
      sourceType: "admin_manual_grant",
      sourceId,
      reason,
      metadata: {
        targetUserId: input.userId,
        targetMembershipId: target.membershipId,
        actorAdminAccountId: input.actorAdminAccountId,
        workOrderNo,
        adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
      },
      createdByUserId: null,
      now: input.now,
    });

    if (target.teamProfileId && !existingLedger) {
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
          adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
          targetOrganizationId: target.organizationId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
        },
      });
    }

    const wallet = await queryOne<{
      credit_balance_cached: number | string;
      credit_reserved_cached: number | string;
      credit_frozen_cached: number | string;
    }>(
      deps.db,
      `
        SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached
        FROM users
        WHERE id = $1
      `,
      [input.userId],
    );

    return {
      status: 200,
      body: {
        data: {
          ledgerEntryId: ledger.id,
          amount,
          availableCredits: Number(wallet?.credit_balance_cached ?? 0),
          reservedCredits: Number(wallet?.credit_reserved_cached ?? 0),
          frozenCredits: Number(wallet?.credit_frozen_cached ?? 0),
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
    const existing = await queryOne<{ id: string; display_name: string | null; email: string | null; status: string }>(
      deps.db,
      "SELECT id, display_name, email, status FROM users WHERE id = $1",
      [input.userId],
    );
    if (!existing) return error(404, "admin_user_not_found", "用户不存在");
    if (!isActiveUserStatus(existing.status)) return inactiveUserOperationError(existing.status);
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
      status: string;
    }>(
      deps.db,
      "SELECT id, phone_e164, email, status FROM users WHERE id = $1",
      [input.userId],
    );
    if (user && !isActiveUserStatus(user.status)) return inactiveUserOperationError(user.status);
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
          phone: user.phone_e164 ? maskCnPhone(user.phone_e164) : null,
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
            phone: user.phone_e164 ? normalizeCnPhone(user.phone_e164) : null,
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
    if (!canTransitionUserStatus(existing.status, input.status)) return inactiveUserOperationError(existing.status);
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
    adjustmentScenario?: string;
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
    const rawWorkOrderNo = String(input.workOrderNo ?? "").trim();
    const workOrderNo = rawWorkOrderNo ? normalizeWorkOrderNo(rawWorkOrderNo) : undefined;
    if (rawWorkOrderNo && !workOrderNo) return error(400, "invalid_work_order_no", "请填写有效工单号，例如 CS-20260605-001");
    const target = await findUserCreditTarget(deps.db, { userId: input.userId });
    if (!target) return error(404, "admin_user_not_found", "用户不存在");
    if (!isWritableCreditTarget(target)) return error(409, "credit_account_not_found", "该用户没有个人积分账户，不能使用共享组织积分");
    const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
    if (!isActiveUserStatus(target.status)) return inactiveUserOperationError(target.status);
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
        compatibilityOrganizationId: target.organizationId,
        userId: input.userId,
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
          adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
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
          adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
        },
        now: input.now,
      });
      ledger = await queryOne<LedgerRow>(
        deps.db,
        "SELECT * FROM credit_ledger_entries WHERE id = $1",
        [reservation.ledgerEntry.id],
      );
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
          adjustmentScenario: normalizeAdjustmentScenario(input.adjustmentScenario),
          targetOrganizationId: target.organizationId,
          targetMembershipId: target.membershipId,
          actorAdminAccountId: input.actorAdminAccountId,
        },
      });
    }

    const wallet = await queryOne<{ credit_balance_cached: number | string; credit_reserved_cached: number | string; credit_frozen_cached: number | string }>(
      deps.db,
      "SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached FROM users WHERE id = $1",
      [input.userId],
    );
    return {
      status: 200,
      body: {
        data: {
          ledgerEntryId: ledger!.id,
          amount,
          availableCredits: Number(wallet?.credit_balance_cached ?? 0),
          reservedCredits: Number(wallet?.credit_reserved_cached ?? 0),
          frozenCredits: Number(wallet?.credit_frozen_cached ?? 0),
        },
      },
    };
  }

  async function restoreFrozenUserCredits(input: {
    userId: string;
    reason: string;
    idempotencyKey: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");
    const target = await findUserCreditTarget(deps.db, {
      userId: input.userId,
    });
    if (!target) return error(404, "admin_user_not_found", "用户不存在");
    if (!isWritableCreditTarget(target)) return error(409, "credit_account_not_found", "该用户没有个人积分账户，不能使用共享组织积分");
    if (!isActiveUserStatus(target.status)) return inactiveUserOperationError(target.status);

    const sourceId = uuidFromIdempotencyKey(input.idempotencyKey);
    const existingLedger = await queryOne<LedgerRow>(
      deps.db,
      `
        SELECT *
        FROM credit_ledger_entries
        WHERE organization_id = $1
          AND source_type = 'admin_frozen_credit_restore'
          AND source_id = $2
          AND entry_type = 'restore'
        LIMIT 1
      `,
      [target.organizationId, sourceId],
    );

    let restoredAmount = Number(existingLedger?.amount ?? 0);
    if (!existingLedger) {
      await deps.db.query("BEGIN");
      try {
        const wallet = await queryOne<{
          credit_balance_cached: number | string;
          credit_reserved_cached: number | string;
          credit_frozen_cached: number | string;
        }>(
          deps.db,
          `
            SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached
            FROM users
            WHERE id = $1
            FOR UPDATE
          `,
          [input.userId],
        );
        const frozenAmount = Number(wallet?.credit_frozen_cached ?? 0);
        if (!wallet || frozenAmount <= 0) {
          const replayedLedger = await queryOne<LedgerRow>(
            deps.db,
            `
              SELECT *
              FROM credit_ledger_entries
              WHERE organization_id = $1
                AND source_type = 'admin_frozen_credit_restore'
                AND source_id = $2
                AND entry_type = 'restore'
              LIMIT 1
            `,
            [target.organizationId, sourceId],
          );
          if (replayedLedger) {
            restoredAmount = Number(replayedLedger.amount ?? 0);
            await deps.db.query("ROLLBACK");
            return {
              status: 200,
              body: {
                data: {
                  restoredAmount,
                  availableCredits: Number(wallet?.credit_balance_cached ?? 0),
                  reservedCredits: Number(wallet?.credit_reserved_cached ?? 0),
                  frozenCredits: Number(wallet?.credit_frozen_cached ?? 0),
                },
              },
            };
          }
          await deps.db.query("ROLLBACK");
          return error(409, "no_frozen_credits", "该用户当前没有可解冻积分");
        }

        const restoreResult = await restoreOrganizationWalletCreditsInTransaction(deps.db, {
          organizationId: target.organizationId,
          userId: input.userId,
          sourceType: "admin_frozen_credit_restore",
          sourceId,
          reason,
          metadata: {
            adminForced: true,
            targetUserId: input.userId,
            targetMembershipId: target.membershipId,
            actorAdminAccountId: input.actorAdminAccountId,
          },
          now: input.now,
        });
        restoredAmount = restoreResult.restoredAmount;
        if (restoredAmount <= 0) {
          await deps.db.query("ROLLBACK");
          return error(409, "frozen_credits_not_restorable", "冻结积分已超过保留期，无法解冻");
        }

        await appendAuditEvent(deps.db, {
          organizationId: input.auditOrganizationId,
          workspaceId: input.auditWorkspaceId,
          actorUserId: null,
          eventType: "admin.credit.frozen_restored",
          targetType: "user",
          targetId: input.userId,
          reason,
          sensitive: true,
          metadata: {
            restoredAmount,
            targetOrganizationId: target.organizationId,
            targetMembershipId: target.membershipId,
            actorAdminAccountId: input.actorAdminAccountId,
          },
        });

        await deps.db.query("COMMIT");
      } catch (error_) {
        await deps.db.query("ROLLBACK");
        throw error_;
      }
    }

    const wallet = await queryOne<{
      credit_balance_cached: number | string;
      credit_reserved_cached: number | string;
      credit_frozen_cached: number | string;
    }>(
      deps.db,
      `
        SELECT credit_balance_cached, credit_reserved_cached, credit_frozen_cached
        FROM users
        WHERE id = $1
      `,
      [input.userId],
    );
    return {
      status: 200,
      body: {
        data: {
          restoredAmount,
          availableCredits: Number(wallet?.credit_balance_cached ?? 0),
          reservedCredits: Number(wallet?.credit_reserved_cached ?? 0),
          frozenCredits: Number(wallet?.credit_frozen_cached ?? 0),
        },
      },
    };
  }

  async function listUserCreditLedger(input: {
    userId: string;
    page?: number;
    pageSize?: number;
    organizationId?: string | null;
    workspaceId?: string | null;
  }) {
    const target = await findUserCreditTarget(deps.db, {
      userId: input.userId,
      organizationId: input.organizationId,
      workspaceId: input.workspaceId,
    });
    if (!target) return error(404, "admin_user_not_found", "用户不存在");
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 50)));
    const page = Math.max(1, Number(input.page ?? 1));
    const ledgerScope = ledgerScopeForTarget(target);
    const fetchLimit = Math.max(page * pageSize * 4, pageSize * 4);
    const totalResult = await deps.db.query<LedgerRow>(
      `
        SELECT *
        FROM credit_ledger_entries
        WHERE ${ledgerScope.sql}
        ORDER BY created_at DESC, id ASC
      `,
      ledgerScope.params,
    );
    const result = await deps.db.query<LedgerRow>(
      `
        SELECT *
        FROM credit_ledger_entries
        WHERE ${ledgerScope.sql}
        ORDER BY created_at DESC, id ASC
        LIMIT $${ledgerScope.limitParamIndex}
      `,
      [...ledgerScope.params, fetchLimit],
    );
    const totalRows = coalesceUserCreditLedgerRows(totalResult.rows);
    const start = (page - 1) * pageSize;
    const rows = coalesceUserCreditLedgerRows(result.rows).slice(start, start + pageSize);
    const summary = await buildUserCreditSummary(deps.db, target, ledgerScope);
    return {
      data: rows.map(ledgerFromRow),
      accountType: resolveCreditAccountType(target),
      summary,
      meta: {
        total: totalRows.length,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(totalRows.length / pageSize)),
      },
    };
  }

  async function listUserModelRequestLogs(input: {
    userId: string;
    page?: number;
    pageSize?: number;
    modelType?: "text" | "image" | "video" | "all";
  }) {
    const user = await queryOne<{ id: string }>(
      deps.db,
      "SELECT id FROM users WHERE id = $1",
      [input.userId],
    );
    if (!user) return error(404, "admin_user_not_found", "用户不存在");

    const page = Math.max(1, Number(input.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(input.pageSize ?? 15)));
    const offset = (page - 1) * pageSize;
    const modelType = normalizeAdminModelTypeFilter(input.modelType);
    const inferredMediaTypeSql = `CASE
      WHEN lower(concat_ws(' ', logs.provider_operation, logs.model_id, logs.provider_model)) LIKE '%video%' THEN 'video'
      WHEN lower(concat_ws(' ', logs.provider_operation, logs.model_id, logs.provider_model)) LIKE '%image%'
        OR lower(concat_ws(' ', logs.provider_operation, logs.model_id, logs.provider_model)) LIKE '%img%'
        OR lower(concat_ws(' ', logs.provider_operation, logs.model_id, logs.provider_model)) LIKE '%gpt-image%' THEN 'image'
      ELSE 'text'
    END`;
    const filterParams: unknown[] = [input.userId];
    const filters = ["logs.user_id = $1"];
    if (modelType !== "all") {
      filterParams.push(modelType);
      filters.push(`COALESCE(model.media_type, ${inferredMediaTypeSql}) = $${filterParams.length}`);
    }
    const whereSql = filters.join(" AND ");
    const totalResult = await deps.db.query<{ count: number | string }>(
      `
        SELECT COUNT(*) AS count
        FROM user_model_request_logs logs
        LEFT JOIN ai_model_configs model
          ON model.model_code = logs.model_id
        WHERE ${whereSql}
      `,
      filterParams,
    );
    const result = await deps.db.query<AdminUserModelRequestLogRow>(
      `
        SELECT
          logs.id,
          logs.provider_request_id,
          project.organization_id,
          logs.workspace_id,
          COALESCE(model.media_type, ${inferredMediaTypeSql}) AS media_type,
          model.display_name,
          COALESCE(allocation.credits_cost, 0) AS credits_cost,
          logs.provider_name,
          logs.provider_operation,
          logs.model_id,
          logs.provider_model,
          logs.request_key,
          logs.request_hash,
          logs.payload_hash,
          logs.payload_summary,
          logs.request_body_json,
          logs.request_text,
          logs.response_text,
          logs.response_usage_json,
          logs.response_finish_reasons_json,
          logs.status,
          logs.failure_code,
          logs.project_id,
          logs.started_at,
          logs.completed_at,
          logs.created_at
        FROM user_model_request_logs logs
        LEFT JOIN projects project
          ON project.id = logs.project_id
        LEFT JOIN ai_model_configs model
          ON model.model_code = logs.model_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(amount), 0) AS credits_cost
          FROM credit_reservation_allocations
          WHERE provider_request_id = logs.provider_request_id
            AND status = 'consumed'
        ) allocation ON true
        WHERE ${whereSql}
        ORDER BY logs.created_at DESC, logs.id DESC
        LIMIT $${filterParams.length + 1}
        OFFSET $${filterParams.length + 2}
      `,
      [...filterParams, pageSize, offset],
    );
    const total = Number(totalResult.rows[0]?.count ?? 0);

    return {
      data: result.rows.map(modelRequestLogFromRow),
      meta: {
        total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async function getTeamPlanLimit(input: { organizationId: string }) {
    const summary = await buildTeamPlanLimitSummary(deps.db, input.organizationId);
    if (!summary) {
      return error(404, "admin_organization_not_found", "团队不存在");
    }
    return { status: 200, body: { data: summary } };
  }

  async function updateTeamPlanLimit(input: {
    organizationId: string;
    seatLimit: number | null;
    reason: string;
    actorAdminAccountId: string;
    auditOrganizationId: string;
    auditWorkspaceId: string;
    now: Date;
  }) {
    const reason = input.reason.trim();
    if (!reason) return error(400, "reason_required", "请填写操作原因");

    const before = await buildTeamPlanLimitSummary(deps.db, input.organizationId);
    if (!before) {
      return error(404, "admin_organization_not_found", "团队不存在");
    }

    const isClearingOverride = input.seatLimit === null;
    if (isClearingOverride) {
      await deps.db.query("DELETE FROM team_plan_limits WHERE organization_id = $1", [input.organizationId]);
    } else {
      const seatLimit = Number(input.seatLimit);
      if (!Number.isInteger(seatLimit) || seatLimit < 0) {
        return error(400, "invalid_team_seat_limit", "子账号上限必须是大于等于 0 的整数");
      }
      await deps.db.query(
        `
          INSERT INTO team_plan_limits (
            id,
            organization_id,
            seat_limit,
            single_account_concurrency_limit,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, 1, $4, $4)
          ON CONFLICT (organization_id)
          DO UPDATE SET
            seat_limit = EXCLUDED.seat_limit,
            updated_at = EXCLUDED.updated_at
        `,
        [
          uuidFromIdempotencyKey(`team-plan-limit:${input.organizationId}`),
          input.organizationId,
          seatLimit,
          input.now,
        ],
      );
    }

    const after = (await buildTeamPlanLimitSummary(deps.db, input.organizationId))!;
    await appendAuditEvent(deps.db, {
      organizationId: input.auditOrganizationId,
      workspaceId: input.auditWorkspaceId,
      actorUserId: null,
      eventType: isClearingOverride ? "admin.team_plan_limit.cleared" : "admin.team_plan_limit.updated",
      targetType: "organization",
      targetId: input.organizationId,
      reason,
      sensitive: false,
      metadata: {
        actorAdminAccountId: input.actorAdminAccountId,
        before,
        after,
      },
    });

    return { status: 200, body: { data: after } };
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
    restoreFrozenUserCredits,
    listUserCreditLedger,
    listUserModelRequestLogs,
    getTeamPlanLimit,
    updateTeamPlanLimit,
  };
}

interface UserCreditTargetRow {
  user_id: string;
  user_status: string;
  organization_id: string;
  organization_name: string | null;
  workspace_id: string | null;
  membership_id: string;
  membership_role: string | null;
  team_profile_id: string | null;
  created_by_user_id: string | null;
}

interface UserCreditTarget {
  userId: string;
  status: string;
  organizationId: string;
  organizationName: string | null;
  workspaceId: string | null;
  membershipId: string;
  membershipRole: string | null;
  teamProfileId: string | null;
  teamRole: string | null;
  teamGroupId: string | null;
  createdByUserId: string | null;
}

interface LedgerScope {
  sql: string;
  params: string[];
  limitParamIndex: number;
}

interface LedgerRow {
  id: string;
  organization_id: string;
  reservation_id: string | null;
  allocation_id: string | null;
  entry_type: string;
  amount: number | string;
  available_delta: number | string;
  reserved_delta: number | string;
  consumed_delta: number | string;
  source_type: string;
  source_id: string;
  reason: string;
  metadata_json: unknown;
  user_id: string | null;
  created_at: Date | string;
}

async function buildTeamPlanLimitSummary(
  db: SqlDatabase,
  organizationId: string,
): Promise<AdminTeamPlanLimitSummary | null> {
  const organization = await queryOne<{
    id: string;
    name: string;
  }>(
    db,
    `
      SELECT id, name
      FROM organizations
      WHERE id = $1
      LIMIT 1
    `,
    [organizationId],
  );
  if (!organization) return null;

  const defaultSeatLimit = await resolveAdminDefaultSubaccountLimit(db);
  const override = await queryOne<{ seat_limit: number | string }>(
    db,
    `
      SELECT seat_limit
      FROM team_plan_limits
      WHERE organization_id = $1
      LIMIT 1
    `,
    [organizationId],
  );
  const usedSeats = await countOrganizationActiveSubaccounts(db, organizationId);
  const overrideSeatLimit = override ? Number(override.seat_limit) : null;
  const effectiveSeatLimit = overrideSeatLimit ?? defaultSeatLimit;

  return {
    organizationId: organization.id,
    organizationName: organization.name,
    defaultSeatLimit,
    effectiveSeatLimit,
    overrideSeatLimit,
    limitSource: override ? "override" : "default",
    usedSeats,
    remainingSeats: Math.max(0, effectiveSeatLimit - usedSeats),
  };
}

async function resolveAdminDefaultSubaccountLimit(db: SqlDatabase) {
  const config = await queryOne<{ value_json: unknown }>(
    db,
    `
      SELECT value_json
      FROM runtime_config_entries
      WHERE key = $1
      LIMIT 1
    `,
    [TEAM_SUBACCOUNT_LIMIT_CONFIG_KEY],
  );
  return normalizeAdminSubaccountLimit(config?.value_json);
}

function normalizeAdminSubaccountLimit(value: unknown) {
  const limit = value === null || value === undefined ? DEFAULT_TEAM_SUBACCOUNT_LIMIT : Number(value);
  if (!Number.isInteger(limit) || limit < 0) return DEFAULT_TEAM_SUBACCOUNT_LIMIT;
  return limit;
}

async function countOrganizationActiveSubaccounts(db: SqlDatabase, organizationId: string) {
  const result = await queryOne<{ count: string | number }>(
    db,
    `
      SELECT COUNT(*) AS count
      FROM team_members member
      JOIN memberships owner_membership
        ON owner_membership.user_id = member.user_id
       AND owner_membership.organization_id = $1
       AND owner_membership.status = 'active'
      WHERE member.status = 'active'
        AND owner_membership.role = 'owner_admin'
    `,
    [organizationId],
  );

  return Number(result?.count ?? 0);
}

async function findUserCreditTarget(
  db: SqlDatabase,
  input: {
    userId: string;
    organizationId?: string | null;
    workspaceId?: string | null;
  },
): Promise<UserCreditTarget | undefined> {
  const params: unknown[] = [input.userId];
  const filters = ["u.id = $1"];
  if (input.organizationId) {
    params.push(input.organizationId);
    filters.push(`m.organization_id = $${params.length}`);
  }
  if (input.workspaceId) {
    params.push(input.workspaceId);
    filters.push(`m.workspace_id = $${params.length}`);
  }
  const row = await queryOne<UserCreditTargetRow>(
    db,
    `
      SELECT
        u.id AS user_id,
        u.status AS user_status,
        m.organization_id,
        m.workspace_id,
        m.id AS membership_id,
        m.role AS membership_role,
        o.name AS organization_name,
        NULL::text AS team_profile_id,
        NULL::text AS team_role,
        NULL::text AS team_group_id,
        NULL::text AS created_by_user_id
      FROM users u
      JOIN memberships m ON m.user_id = u.id
      LEFT JOIN organizations o ON o.id = m.organization_id
      WHERE ${filters.join(" AND ")}
      ORDER BY
        CASE
          WHEN o.name = '${PERSONAL_CREDIT_ORGANIZATION_NAME}' AND m.role = 'owner_admin' THEN 0
          WHEN m.role = 'owner_admin' THEN 1
          ELSE 2
        END,
        m.created_at ASC
      LIMIT 1
    `,
    params,
  );

  if (!row) {
    return undefined;
  }

  return {
    userId: row.user_id,
    status: row.user_status,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    workspaceId: row.workspace_id,
    membershipId: row.membership_id,
    membershipRole: row.membership_role,
    teamProfileId: row.team_profile_id,
    teamRole: row.team_role,
    teamGroupId: row.team_group_id,
    createdByUserId: row.created_by_user_id,
  };
}

function ledgerScopeForTarget(target: UserCreditTarget): LedgerScope {
  const targetFilter = `(
    user_id = $1::uuid
    OR
    metadata_json->>'targetUserId' = $2
    OR metadata_json->>'targetMembershipId' = $3
    OR created_by_user_id = $1::uuid
    OR EXISTS (
      SELECT 1
      FROM credit_reservations ledger_reservation
      JOIN workflows ledger_workflow
        ON ledger_workflow.organization_id = ledger_reservation.organization_id
       AND ledger_workflow.id = ledger_reservation.workflow_id
      WHERE ledger_reservation.organization_id = credit_ledger_entries.organization_id
        AND ledger_reservation.id = credit_ledger_entries.reservation_id
        AND ledger_workflow.created_by_user_id = $1::uuid
    )
    OR EXISTS (
      SELECT 1
      FROM credit_reservation_allocations ledger_allocation
      JOIN tasks ledger_task
        ON ledger_task.organization_id = ledger_allocation.organization_id
       AND ledger_task.id = ledger_allocation.task_id
      JOIN workflows ledger_workflow
        ON ledger_workflow.organization_id = ledger_task.organization_id
       AND ledger_workflow.id = ledger_task.workflow_id
      WHERE ledger_allocation.organization_id = credit_ledger_entries.organization_id
        AND ledger_allocation.id = credit_ledger_entries.allocation_id
        AND ledger_workflow.created_by_user_id = $1::uuid
    )
  )`;
  if (target.membershipRole === "owner_admin" || target.teamRole === "admin" || target.teamRole === "group_admin") {
    const managedMemberFilter = `(
      ${targetFilter}
      OR EXISTS (
        SELECT 1
        FROM team_members ledger_member
        LEFT JOIN credit_reservations managed_reservation
          ON managed_reservation.organization_id = credit_ledger_entries.organization_id
         AND managed_reservation.id = credit_ledger_entries.reservation_id
        WHERE (
            ledger_member.id = credit_ledger_entries.user_id
            OR ledger_member.id::text = credit_ledger_entries.metadata_json->>'targetUserId'
            OR ledger_member.id::text = credit_ledger_entries.metadata_json->>'targetMembershipId'
            OR ledger_member.id = credit_ledger_entries.created_by_user_id
            OR ledger_member.id = managed_reservation.user_id
            OR ledger_member.id::text = managed_reservation.metadata_json->>'targetUserId'
            OR ledger_member.id::text = managed_reservation.metadata_json->>'targetMembershipId'
            OR ledger_member.id = managed_reservation.created_by_user_id
          )
          AND ledger_member.user_id = $1::uuid
          AND ledger_member.status <> 'deleted'
      )
    )`;
    return {
      sql: managedMemberFilter,
      params: [target.userId, target.userId, target.membershipId],
      limitParamIndex: 4,
    };
  }
  return {
    sql: targetFilter,
    params: [target.userId, target.userId, target.membershipId],
    limitParamIndex: 4,
  };
}

function isMemberWalletTarget(target: UserCreditTarget) {
  return Boolean(target.teamProfileId);
}

function isPersonalCreditOwnerTarget(target: UserCreditTarget) {
  return target.organizationName === PERSONAL_CREDIT_ORGANIZATION_NAME
    && !target.teamProfileId;
}

function resolveCreditAccountType(target: UserCreditTarget): "管理员账户" | "子账户" | "普通账户" {
  if (target.membershipRole === "owner_admin" || target.teamRole === "admin" || target.teamRole === "group_admin") {
    return "管理员账户";
  }
  return "普通账户";
}

function isWritableCreditTarget(target: UserCreditTarget) {
  return isMemberWalletTarget(target) || isPersonalCreditOwnerTarget(target);
}

async function buildUserCreditSummary(
  db: SqlDatabase,
  target: UserCreditTarget,
  ledgerScope: LedgerScope,
) {
  const wallet = await queryOne<{
    credit_balance_cached: number | string;
    credit_reserved_cached: number | string;
    credit_frozen_cached: number | string;
    credit_frozen_at: Date | string | null;
    credit_frozen_until: Date | string | null;
  }>(
    db,
    `
      SELECT
        credit_balance_cached,
        credit_reserved_cached,
        credit_frozen_cached,
        credit_frozen_at,
        credit_frozen_until
      FROM users
      WHERE id = $1
    `,
    [target.userId],
  );
  const totals = await queryOne<{
    total_granted: number | string;
    total_released: number | string;
  }>(
    db,
    `
      SELECT
        COALESCE(SUM(amount) FILTER (WHERE entry_type = 'grant'), 0) AS total_granted,
        COALESCE(SUM(amount) FILTER (WHERE entry_type = 'release'), 0) AS total_released
      FROM credit_ledger_entries
      WHERE ${ledgerScope.sql}
    `,
    ledgerScope.params,
  );
  const reservationConsumed = await queryOne<{ total_consumed: number | string }>(
    db,
    `
      SELECT COALESCE(SUM(r.amount_consumed), 0) AS total_consumed
      FROM credit_reservations r
      LEFT JOIN workflows reservation_workflow
        ON reservation_workflow.organization_id = r.organization_id
       AND reservation_workflow.id = r.workflow_id
      WHERE (
        r.user_id = $1::uuid
        OR r.metadata_json->>'targetUserId' = $2
        OR r.metadata_json->>'targetMembershipId' = $3
        OR r.created_by_user_id = $1::uuid
        OR reservation_workflow.created_by_user_id = $1::uuid
      )
    `,
    [target.userId, target.userId, target.membershipId],
  );
  const standaloneConsumed = await queryOne<{ total_consumed: number | string }>(
    db,
    `
      SELECT COALESCE(SUM(amount), 0) AS total_consumed
      FROM credit_ledger_entries
      WHERE entry_type = 'consume'
        AND reservation_id IS NULL
        AND allocation_id IS NULL
        AND ${ledgerScope.sql}
    `,
    ledgerScope.params,
  );
  const reservations = await queryOne<{
    active_count: number | string;
    manual_review_count: number | string;
    active_reserved: number | string;
  }>(
    db,
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'active') AS active_count,
        COUNT(*) FILTER (WHERE status = 'manual_review_required') AS manual_review_count,
        COALESCE(SUM(amount_reserved) FILTER (WHERE status = 'active'), 0) AS active_reserved
      FROM credit_reservations
      WHERE (
        user_id = $1::uuid
        OR metadata_json->>'targetUserId' = $2
        OR metadata_json->>'targetMembershipId' = $3
      )
    `,
    [target.userId, target.userId, target.membershipId],
  );

  const organizationAvailable = Number(wallet?.credit_balance_cached ?? 0);
  const organizationReserved = Number(wallet?.credit_reserved_cached ?? 0);
  const organizationFrozen = Number(wallet?.credit_frozen_cached ?? 0);
  const memberAvailable = null;
  const memberUsed = null;
  const displayAvailableCredits = organizationAvailable;
  const targetReserved = Number(reservations?.active_reserved ?? 0);
  const totalConsumed = Number(reservationConsumed?.total_consumed ?? 0) + Number(standaloneConsumed?.total_consumed ?? 0);
  return {
    balanceScope: "user",
    organizationAvailableCredits: organizationAvailable,
    organizationReservedCredits: organizationReserved,
    organizationFrozenCredits: organizationFrozen,
    organizationFrozenAt: organizationFrozen > 0 && wallet?.credit_frozen_at
      ? new Date(wallet.credit_frozen_at).toISOString()
      : null,
    organizationFrozenUntil: organizationFrozen > 0 && wallet?.credit_frozen_until
      ? new Date(wallet.credit_frozen_until).toISOString()
      : null,
    memberAvailableCredits: memberAvailable,
    memberUsedCredits: memberUsed,
    displayAvailableCredits,
    displayCreditBalance: displayAvailableCredits + organizationFrozen,
    frozenCredits: organizationFrozen,
    displayReservedCredits: targetReserved || organizationReserved,
    totalGrantedCredits: Number(totals?.total_granted ?? 0),
    totalConsumedCredits: totalConsumed,
    totalReleasedCredits: Number(totals?.total_released ?? 0),
    activeReservationCount: Number(reservations?.active_count ?? 0),
    manualReviewReservationCount: Number(reservations?.manual_review_count ?? 0),
  };
}

function userFromRow(row: AdminUserRow): AdminUserListItem {
  const accountType = resolveAccountType(row);
  const availableCredits = Number(row.organization_credit_balance ?? 0);
  const frozenCredits = Number(row.organization_frozen_balance ?? 0);
  const reservedCredits = Number(row.workspace_reserved_credits ?? row.organization_reserved_balance ?? 0);
  return {
    userId: row.user_id,
    inviteCode: row.invite_code,
    displayName: row.display_name ?? "未命名用户",
    phone: row.phone_e164 ? normalizeAdminUserPhone(row.phone_e164) : null,
    email: maskEmail(row.email),
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
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
    availableCredits,
    reservedCredits,
    frozenCredits,
    displayCreditBalance: availableCredits + frozenCredits,
    usedCredits: Number(row.member_credit_used ?? 0),
    subaccountCount: Number(row.subaccount_count ?? 0),
  };
}

function isPersonalCreditOwnerRow(row: AdminUserRow) {
  return row.organization_name === PERSONAL_CREDIT_ORGANIZATION_NAME
    && row.membership_role === "owner_admin"
    && !row.team_role;
}

function resolveAccountType(row: AdminUserRow): AdminUserListItem["accountType"] {
  if (row.membership_role === "team_member") {
    return "subaccount";
  }
  if (row.membership_role === "owner_admin") {
    return "owner_account";
  }
  return "user";
}

function normalizeAdminUserPhone(phone: string): string {
  try {
    return normalizeCnPhone(phone);
  } catch {
    return phone;
  }
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
    reservationId: row.reservation_id,
    allocationId: row.allocation_id,
    entryType: row.entry_type,
    amount: Number(row.amount),
    availableDelta: Number(row.available_delta),
    reservedDelta: Number(row.reserved_delta),
    consumedDelta: Number(row.consumed_delta),
    sourceType: row.source_type,
    sourceId: row.source_id,
    reason: row.reason,
    metadata: normalizeJson(row.metadata_json),
    content: creditLedgerContentLabel(row),
    userId: row.user_id,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function creditLedgerContentLabel(row: LedgerRow) {
  const metadata = normalizeJson(row.metadata_json);
  const reason = String(row.reason ?? "").trim();
  const sourceType = String(row.source_type ?? "").trim().toLowerCase();
  const mediaType = String(metadata.mediaType ?? metadata.kind ?? "").trim().toLowerCase();
  const taskType = String(metadata.taskType ?? metadata.task_type ?? metadata.operation ?? "").trim().toLowerCase();
  const scenario = String(metadata.adjustmentScenario ?? "").trim();
  const packageName = String(metadata.packageName ?? metadata.package_name ?? metadata.planName ?? metadata.plan_name ?? "").trim();
  const credits = Number(row.amount ?? 0);
  const text = [sourceType, reason, mediaType, taskType, metadata.modelCode, metadata.providerOperation]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (sourceType === "payment_order") {
    return packageName ? `充值${packageName}套餐增加积分` : `充值${Number.isFinite(credits) ? `${credits}积分套餐` : "套餐"}增加积分`;
  }
  if (sourceType === "membership_gift") {
    return "会员赠送积分";
  }
  if (sourceType.includes("admin")) {
    if (scenario === "promotion" || scenario === "recharge_bonus") return "活动增加积分";
    return row.entry_type === "consume" ? "手动扣减积分" : "手动增加积分";
  }
  if (text.includes("storyboard")) {
    return row.entry_type === "release" ? "AI分镜生成返还积分" : "生AI分镜扣减";
  }
  if (text.includes("script") || mediaType === "text") {
    return row.entry_type === "release" ? "生成剧本返还积分" : "生成剧本扣减";
  }
  if (text.includes("video") || mediaType === "video") {
    return row.entry_type === "release" ? "生视频返还积分" : "生视频扣减";
  }
  if (text.includes("image") || mediaType === "image") {
    return row.entry_type === "release" ? "生图返还积分" : "生图扣减";
  }
  if (row.entry_type === "grant") return "增加积分";
  if (row.entry_type === "release") return "任务返还积分";
  return row.entry_type === "consume" || row.entry_type === "reservation" ? "任务扣减积分" : "积分变动";
}

function modelRequestLogFromRow(
  row: AdminUserModelRequestLogRow,
): AdminUserModelRequestLogItem {
  const modelType = normalizeAdminModelType(row.media_type);
  return {
    id: row.id,
    providerRequestId: row.provider_request_id,
    organizationId: row.organization_id ?? "",
    workspaceId: row.workspace_id,
    modelType,
    modelName: row.display_name?.trim() || row.model_id || row.provider_model,
    creditsCost: Number(row.credits_cost ?? 0),
    providerName: row.provider_name,
    providerOperation: row.provider_operation,
    modelId: row.model_id,
    providerModel: row.provider_model,
    requestKey: row.request_key,
    requestHash: row.request_hash,
    payloadHash: row.payload_hash,
    payloadSummary: row.payload_summary,
    requestBody: row.request_body_json ?? {},
    requestText: row.request_text,
    responseText: row.response_text,
    responseUsage: row.response_usage_json ?? null,
    responseFinishReasons: Array.isArray(row.response_finish_reasons_json)
      ? row.response_finish_reasons_json
          .map((item) => String(item ?? "").trim())
          .filter(Boolean)
      : [],
    status: row.status,
    failureCode: row.failure_code,
    projectId: row.project_id,
    startedAt: new Date(row.started_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function coalesceUserCreditLedgerRows(rows: LedgerRow[]): LedgerRow[] {
  const reservationDeductionKeys = new Set<string>();
  for (const row of rows) {
    if (row.entry_type !== "reservation") {
      continue;
    }
    const key = creditLedgerTaskDeductionKey(row);
    if (key) {
      reservationDeductionKeys.add(key);
    }
  }

  return rows.filter((row) => {
    const key = creditLedgerTaskDeductionKey(row);
    if (row.entry_type === "consume" && key && reservationDeductionKeys.has(key)) {
      return false;
    }
    return true;
  });
}

function creditLedgerTaskDeductionKey(row: LedgerRow): string {
  const metadata = normalizeJson(row.metadata_json);
  const reservationId = String(row.reservation_id ?? "").trim();
  if (reservationId) {
    return `reservation:${reservationId}`;
  }
  const taskId = String(metadata.taskId ?? metadata.task_id ?? "").trim();
  if (taskId) {
    return `task:${taskId}`;
  }
  return "";
}

function normalizeJson(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") return JSON.parse(value) as Record<string, unknown>;
  return value as Record<string, unknown>;
}

function normalizeAdminModelTypeFilter(value: unknown): "all" | "text" | "image" | "video" {
  const normalized = String(value ?? "all").trim().toLowerCase();
  if (normalized === "text" || normalized === "image" || normalized === "video") {
    return normalized;
  }
  return "all";
}

function normalizeAdminModelType(value: unknown): "text" | "image" | "video" {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "image" || normalized === "video") {
    return normalized;
  }
  return "text";
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

function normalizeAdjustmentScenario(value: string | undefined): string {
  const scenario = String(value ?? "").trim();
  if (
    [
      "manual_adjustment",
      "compensation",
      "recharge_bonus",
      "default_grant",
      "correction",
      "promotion",
    ].includes(scenario)
  ) {
    return scenario;
  }
  return "manual_adjustment";
}

function isActiveUserStatus(status: string | null | undefined): boolean {
  return status === "active";
}

function canTransitionUserStatus(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === "active") {
    return nextStatus === "disabled" || nextStatus === "archived";
  }
  if (currentStatus === "disabled") {
    return nextStatus === "active";
  }
  return false;
}

function inactiveUserOperationError(status: string | null | undefined) {
  const message = status === "archived"
    ? "账户已归档，仅允许查看历史记录"
    : "账户未启用，仅允许查看或启用后再操作";
  return error(409, "inactive_user_operation_blocked", message);
}

function error(status: number, code: string, message: string) {
  return { status, body: { error: { code, message } } };
}

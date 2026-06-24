import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const listMembershipPlansCommand: ApiCommandContract = {
  name: "ListMembershipPlans",
  operationName: operationNames.membershipPlansList,
  capability: capabilities.billingPurchase,
  idempotencyRequired: false,
  requestSchema: {},
  responseSchema: {
    plans: "active membership plan summaries",
  },
  resourceScope: "organization:{organization_id}",
  statePreconditions: ["organization.status = active"],
  businessErrors: ["organization_suspended"],
  auditEvent: "membership.plans.listed",
  verificationIds: ["MEMBERSHIP-plans-list"],
};

export const createMembershipOrderCommand: ApiCommandContract = {
  name: "CreateMembershipOrder",
  operationName: operationNames.membershipOrderCreate,
  capability: capabilities.billingPurchase,
  idempotencyRequired: true,
  requestSchema: {
    membershipPlanId: "uuid",
  },
  responseSchema: {
    orderId: "uuid",
    orderStatus: "pending_payment",
  },
  resourceScope: "organization:{organization_id}",
  statePreconditions: ["organization.status = active", "membership_plan.status = active"],
  businessErrors: [
    "membership_plan_not_found",
    "membership_plan_not_available",
    "organization_suspended",
  ],
  auditEvent: "membership.order.created",
  verificationIds: ["IDEMP-membership-order-create", "MEMBERSHIP-order-create"],
};

export const saveMembershipPlanCommand: ApiCommandContract = {
  name: "SaveMembershipPlan",
  operationName: operationNames.membershipPlanSave,
  capability: capabilities.adminBillingConfig,
  idempotencyRequired: true,
  requestSchema: {
    id: "uuid|null",
    code: "required text",
    displayName: "required text",
    tier: "experience|professional",
    periodUnit: "day|month|quarter|year",
    periodCount: "positive integer",
    amountMinor: "positive integer",
    currency: "CNY",
    giftCredits: "non-negative integer",
    seatLimit: "positive integer|null",
    entitlements: "string[]",
    priorityRules: "json object",
    displayMetadata: "json object",
    status: "active|inactive|archived",
    validFrom: "iso8601|null",
    validUntil: "iso8601|null",
    reason: "required text",
  },
  responseSchema: {
    plan: "membership plan view",
  },
  resourceScope: "admin:membership_plan:{plan_id|new}",
  statePreconditions: [
    "actor has admin billing configuration capability",
    "membership_plan.code is unique",
  ],
  businessErrors: [
    "idempotency_conflict",
    "membership_plan_code_conflict",
    "reason_required",
    "invalid_membership_plan",
    "admin_forbidden",
  ],
  auditEvent: "membership.plan.saved",
  verificationIds: ["IDEMP-membership-plan-save", "MEMBERSHIP-plan-save"],
};

export const deleteMembershipPlanCommand: ApiCommandContract = {
  name: "DeleteMembershipPlan",
  operationName: operationNames.membershipPlanDelete,
  capability: capabilities.adminBillingConfig,
  idempotencyRequired: true,
  requestSchema: {
    id: "uuid",
    reason: "required text",
  },
  responseSchema: {
    plan: "archived membership plan view",
  },
  resourceScope: "admin:membership_plan:{plan_id}",
  statePreconditions: [
    "actor has admin billing configuration capability",
    "membership_plan exists",
  ],
  businessErrors: [
    "idempotency_conflict",
    "invalid_plan_id",
    "plan_not_found",
    "reason_required",
    "admin_forbidden",
  ],
  auditEvent: "membership.plan.deleted",
  verificationIds: ["IDEMP-membership-plan-delete", "MEMBERSHIP-plan-delete"],
};

export const getMembershipStatusCommand: ApiCommandContract = {
  name: "GetMembershipStatus",
  operationName: operationNames.membershipStatusGet,
  capability: capabilities.workspaceRead,
  idempotencyRequired: false,
  requestSchema: {},
  responseSchema: {
    status: "none|experience_active|professional_active|expired",
    currentTier: "experience|professional|null",
    currentPeriodEndAt: "iso8601|null",
  },
  resourceScope: "organization:{organization_id}",
  statePreconditions: ["actor can read workspace organization"],
  businessErrors: ["organization_not_found", "workspace_forbidden"],
  auditEvent: "membership.status.read",
  verificationIds: ["MEMBERSHIP-status-get"],
};

export const membershipCommandContracts = [
  listMembershipPlansCommand,
  createMembershipOrderCommand,
  saveMembershipPlanCommand,
  deleteMembershipPlanCommand,
  getMembershipStatusCommand,
];

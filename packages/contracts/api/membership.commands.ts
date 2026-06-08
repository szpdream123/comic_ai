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
  getMembershipStatusCommand,
];

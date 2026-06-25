import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const createBillingOrderCommand: ApiCommandContract = {
  name: "CreateBillingOrder",
  operationName: operationNames.billingCreateOrder,
  capability: capabilities.billingPurchase,
  idempotencyRequired: true,
  requestSchema: { creditPackageId: "uuid" },
  responseSchema: { orderId: "uuid", orderStatus: "pending_payment" },
  resourceScope: "organization:{organization_id}",
  statePreconditions: ["organization.status = active", "credit_package.status = active"],
  businessErrors: ["credit_package_not_found", "organization_suspended"],
  auditEvent: "billing.order_created",
  verificationIds: ["IDEMP-005", "PAY-create-order"],
};

export const createPaymentIntentCommand: ApiCommandContract = {
  name: "CreatePaymentIntent",
  operationName: operationNames.billingCreatePaymentIntent,
  capability: capabilities.billingPurchase,
  idempotencyRequired: true,
  requestSchema: { orderId: "uuid", provider: "paylab|wechat_pay|alipay", productMode: "string" },
  responseSchema: { paymentIntentId: "uuid", payAction: "provider-normalized action" },
  resourceScope: "order:{order_id}",
  statePreconditions: ["order.status = pending_payment", "order not expired"],
  businessErrors: ["order_not_payable", "provider_not_enabled"],
  auditEvent: "billing.payment_intent_created",
  verificationIds: ["PAY-create-intent"],
};

export const requestRefundCommand: ApiCommandContract = {
  name: "RequestRefund",
  operationName: operationNames.billingRequestRefund,
  capability: capabilities.billingRefund,
  idempotencyRequired: true,
  requestSchema: { orderId: "uuid", amountMinor: "integer", reason: "required text" },
  responseSchema: { refundId: "uuid", status: "pending|manual_review_required" },
  resourceScope: "order:{order_id}",
  statePreconditions: ["order.status in paid|partially_refunded", "admin refund capability"],
  businessErrors: ["refund_not_allowed", "invoice_reversal_required"],
  auditEvent: "billing.refund_requested",
  verificationIds: ["PAY-refund", "PAY-invoice-refund-gate"],
};

export const saveCreditPackageCommand: ApiCommandContract = {
  name: "SaveCreditPackage",
  operationName: operationNames.creditPackageSave,
  capability: capabilities.adminBillingConfig,
  idempotencyRequired: true,
  requestSchema: {
    id: "uuid|null",
    code: "required text",
    displayName: "required text",
    subtitle: "text|null",
    credits: "positive integer",
    giftCredits: "non-negative integer",
    amountMinor: "positive integer",
    currency: "CNY",
    badge: "text|null",
    sortOrder: "integer",
    metadata: "json object",
    status: "active|inactive|archived",
    validFrom: "iso8601|null",
    validUntil: "iso8601|null",
  },
  responseSchema: {
    package: "credit package view",
  },
  resourceScope: "admin:credit_package:{package_id|new}",
  statePreconditions: [
    "actor has admin billing configuration capability",
    "credit_package.code is unique",
  ],
  businessErrors: [
    "idempotency_conflict",
    "credit_package_code_conflict",
    "invalid_credit_package",
    "admin_forbidden",
  ],
  auditEvent: "credit_package.saved",
  verificationIds: ["IDEMP-credit-package-save", "CREDIT-package-save"],
};

export const deleteCreditPackageCommand: ApiCommandContract = {
  name: "DeleteCreditPackage",
  operationName: operationNames.creditPackageDelete,
  capability: capabilities.adminBillingConfig,
  idempotencyRequired: true,
  requestSchema: {
    id: "uuid",
  },
  responseSchema: {
    package: "archived credit package view",
  },
  resourceScope: "admin:credit_package:{package_id}",
  statePreconditions: [
    "actor has admin billing configuration capability",
    "credit_package exists",
  ],
  businessErrors: [
    "idempotency_conflict",
    "invalid_credit_package_id",
    "credit_package_not_found",
    "admin_forbidden",
  ],
  auditEvent: "credit_package.deleted",
  verificationIds: ["IDEMP-credit-package-delete", "CREDIT-package-delete"],
};

export const billingCommandContracts = [
  createBillingOrderCommand,
  createPaymentIntentCommand,
  requestRefundCommand,
  saveCreditPackageCommand,
  deleteCreditPackageCommand,
];

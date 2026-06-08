import { capabilities } from "../domain/capabilities.ts";
import { operationNames } from "../domain/operation-names.ts";
import type { ApiCommandContract } from "./types.ts";

export const adminAuthChangePasswordCommand: ApiCommandContract = {
  name: "AdminAuthChangePassword",
  operationName: operationNames.adminAuthChangePassword,
  capability: capabilities.adminAuthManage,
  idempotencyRequired: true,
  requestSchema: {
    oldPassword: "required text",
    newPassword: "required text",
    revokeOtherSessions: "boolean",
  },
  responseSchema: { passwordChanged: true },
  resourceScope: "admin_account:{admin_account_id}",
  statePreconditions: ["admin_session.status = active"],
  businessErrors: [
    "admin_unauthenticated",
    "admin_old_password_invalid",
    "admin_password_policy_failed",
  ],
  auditEvent: "admin.auth.password_changed",
  verificationIds: ["ADMIN-AUTH-change-password"],
};

export const adminAuthRevokeOtherSessionsCommand: ApiCommandContract = {
  name: "AdminAuthRevokeOtherSessions",
  operationName: operationNames.adminAuthRevokeOtherSessions,
  capability: capabilities.adminAuthManage,
  idempotencyRequired: true,
  requestSchema: {},
  responseSchema: { revokedCount: "integer" },
  resourceScope: "admin_account:{admin_account_id}",
  statePreconditions: ["admin_session.status = active"],
  businessErrors: ["admin_unauthenticated"],
  auditEvent: "admin.auth.sessions_revoked",
  verificationIds: ["ADMIN-AUTH-revoke-other-sessions"],
};

export const adminAuthUpdateProfileCommand: ApiCommandContract = {
  name: "AdminAuthUpdateProfile",
  operationName: operationNames.adminAuthUpdateProfile,
  capability: capabilities.adminAuthManage,
  idempotencyRequired: true,
  requestSchema: {
    displayName: "required text",
  },
  responseSchema: { account: "admin account view" },
  resourceScope: "admin_account:{admin_account_id}",
  statePreconditions: ["admin_session.status = active", "admin_account.status = active"],
  businessErrors: ["admin_unauthenticated", "admin_display_name_invalid"],
  auditEvent: "admin.auth.profile_updated",
  verificationIds: ["ADMIN-AUTH-update-profile"],
};

export const adminAuthCommandContracts = [
  adminAuthChangePasswordCommand,
  adminAuthRevokeOtherSessionsCommand,
  adminAuthUpdateProfileCommand,
];

export const operationNames = {
  projectCreate: "project.create",
  scriptParse: "script.parse",
  shotsSplit: "shots.split",
  shotImageGenerate: "shot.image.generate",
  shotVideoGenerate: "shot.video.generate",
  episodeImageGenerate: "episode.image.generate",
  episodeVideoGenerate: "episode.video.generate",
  calibrationGenerate: "calibration.generate",
  calibrationPass: "calibration.pass",
  calibrationSkip: "calibration.skip",
  calibrationOverride: "calibration.override",
  exportCreate: "export.create",
  billingCreateOrder: "billing.create_order",
  billingCreatePaymentIntent: "billing.create_payment_intent",
  billingRequestRefund: "billing.request_refund",
  opsManualSettleTask: "ops.manual_settle_task",
  opsRetryTask: "ops.retry_task",
  opsRetryFinalize: "ops.retry_finalize",
  opsRetryPersistAsset: "ops.retry_persist_asset",
  opsMarkPaymentRiskReviewed: "ops.mark_payment_risk_reviewed",
  opsRepairPaidWithoutCredit: "ops.repair_paid_without_credit",
  opsGenerationQueueJobOperate: "ops.generation_queue_job_operate",
  adminAuthChangePassword: "admin.auth.change_password",
  adminAuthRevokeOtherSessions: "admin.auth.revoke_other_sessions",
  adminAuthUpdateProfile: "admin.auth.update_profile",
} as const;

export type OperationName = (typeof operationNames)[keyof typeof operationNames];

export const idempotentOperationNames = Object.values(operationNames);

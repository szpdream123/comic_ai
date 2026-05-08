export const operationNames = {
  projectCreate: "project.create",
  scriptParse: "script.parse",
  shotsSplit: "shots.split",
  shotImageGenerate: "shot.image.generate",
  shotVideoGenerate: "shot.video.generate",
  calibrationGenerate: "calibration.generate",
  calibrationPass: "calibration.pass",
  calibrationSkip: "calibration.skip",
  exportCreate: "export.create",
  billingCreateOrder: "billing.create_order",
  billingCreatePaymentIntent: "billing.create_payment_intent",
  billingRequestRefund: "billing.request_refund",
  opsManualSettleTask: "ops.manual_settle_task",
  opsRetryTask: "ops.retry_task",
} as const;

export type OperationName = (typeof operationNames)[keyof typeof operationNames];

export const idempotentOperationNames = Object.values(operationNames);

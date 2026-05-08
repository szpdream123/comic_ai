export const eventTypes = {
  workflowCompleted: "workflow.completed",
  taskSucceeded: "task.succeeded",
  taskFailed: "task.failed",
  assetVersionCreated: "asset.version.created",
  calibrationPassed: "calibration.passed",
  paymentSucceeded: "payment.succeeded",
  paymentRefundSucceeded: "payment.refund.succeeded",
  creditGrantCreated: "credit.grant.created",
  invoiceIssued: "invoice.issued",
  exportReady: "export.ready",
} as const;

export type EventType = (typeof eventTypes)[keyof typeof eventTypes];

export const p0EventTypes = Object.values(eventTypes);

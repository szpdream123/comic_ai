export const CANVAS_PRODUCT_LIMITS = Object.freeze({
  document: Object.freeze({
    maximumBytes: 5 * 1024 * 1024,
    maximumNodes: 2_000,
    maximumEdges: 5_000,
    maximumJsonDepth: 64,
  }),
  generation: Object.freeze({
    maximumBatchNodes: 100,
    billingPolicy: "existing_credit_ledger",
    reservationPolicy: "reserve_before_dispatch",
    modelLimitsPolicy: "active_model_config",
  }),
  member: Object.freeze({
    billingPolicy: "team_member_allocated_credits",
  }),
});

export type CanvasProductLimits = typeof CANVAS_PRODUCT_LIMITS;

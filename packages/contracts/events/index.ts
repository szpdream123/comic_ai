export type { EventContract } from "./types.ts";
export { workflowEventContracts } from "./workflow.events.ts";
export { taskEventContracts } from "./task.events.ts";
export { paymentEventContracts } from "./payment.events.ts";
export { creditEventContracts } from "./credit.events.ts";
export { assetEventContracts } from "./asset.events.ts";
export { calibrationEventContracts } from "./calibration.events.ts";
export { exportEventContracts } from "./export.events.ts";

import { assetEventContracts } from "./asset.events.ts";
import { calibrationEventContracts } from "./calibration.events.ts";
import { creditEventContracts } from "./credit.events.ts";
import { exportEventContracts } from "./export.events.ts";
import { paymentEventContracts } from "./payment.events.ts";
import { taskEventContracts } from "./task.events.ts";
import { workflowEventContracts } from "./workflow.events.ts";

export const allEventContracts = [
  ...workflowEventContracts,
  ...taskEventContracts,
  ...assetEventContracts,
  ...calibrationEventContracts,
  ...paymentEventContracts,
  ...creditEventContracts,
  ...exportEventContracts,
];

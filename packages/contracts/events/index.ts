export type { EventContract } from "./types.ts";
export { workflowEventContracts } from "./workflow.events.ts";
export { taskEventContracts } from "./task.events.ts";
export { paymentEventContracts } from "./payment.events.ts";
export { creditEventContracts } from "./credit.events.ts";

import { creditEventContracts } from "./credit.events.ts";
import { paymentEventContracts } from "./payment.events.ts";
import { taskEventContracts } from "./task.events.ts";
import { workflowEventContracts } from "./workflow.events.ts";

export const allEventContracts = [
  ...workflowEventContracts,
  ...taskEventContracts,
  ...paymentEventContracts,
  ...creditEventContracts,
];

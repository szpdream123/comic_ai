export type { ApiCommandContract } from "./types.ts";
export { canvasCommandContracts } from "./canvas.commands.ts";
export { projectCommandContracts } from "./project.commands.ts";
export { shotCommandContracts } from "./shot.commands.ts";
export { episodeCommandContracts } from "./episode.commands.ts";
export { calibrationCommandContracts } from "./calibration.commands.ts";
export { exportCommandContracts } from "./export.commands.ts";
export { billingCommandContracts } from "./billing.commands.ts";
export { membershipCommandContracts } from "./membership.commands.ts";
export { adminAuthCommandContracts } from "./admin-auth.commands.ts";
export { adminOpsCommandContracts } from "./admin-ops.commands.ts";

import { adminAuthCommandContracts } from "./admin-auth.commands.ts";
import { adminOpsCommandContracts } from "./admin-ops.commands.ts";
import { billingCommandContracts } from "./billing.commands.ts";
import { calibrationCommandContracts } from "./calibration.commands.ts";
import { canvasCommandContracts } from "./canvas.commands.ts";
import { episodeCommandContracts } from "./episode.commands.ts";
import { exportCommandContracts } from "./export.commands.ts";
import { membershipCommandContracts } from "./membership.commands.ts";
import { projectCommandContracts } from "./project.commands.ts";
import { shotCommandContracts } from "./shot.commands.ts";

export const allApiCommandContracts = [
  ...canvasCommandContracts,
  ...projectCommandContracts,
  ...shotCommandContracts,
  ...episodeCommandContracts,
  ...calibrationCommandContracts,
  ...exportCommandContracts,
  ...billingCommandContracts,
  ...membershipCommandContracts,
  ...adminAuthCommandContracts,
  ...adminOpsCommandContracts,
];

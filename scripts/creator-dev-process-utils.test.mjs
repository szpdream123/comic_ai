import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  commandIncludes,
  configuredPort,
  generationQueueEnabled,
  isProjectProcess,
} from "./creator-dev-process-utils.mjs";

describe("creator dev process utilities", () => {
  it("uses and validates the configured port", () => {
    assert.equal(configuredPort({ PORT: "5432" }), 5432);
    assert.throws(() => configuredPort({ PORT: "0" }), /creator_dev_port_invalid/);
  });

  it("requires both project root and launcher marker for process ownership", () => {
    const processInfo = {
      commandLine: "D:\\node\\node.exe D:\\repo\\comic-ai\\scripts\\run-creator-dev-stack.mjs",
    };
    assert.equal(isProjectProcess(processInfo, "D:\\repo\\comic-ai", "run-creator-dev-stack.mjs"), true);
    assert.equal(isProjectProcess(processInfo, "D:\\repo\\other", "run-creator-dev-stack.mjs"), false);
    assert.equal(commandIncludes(processInfo, "run-creator-dev-stack.mjs"), true);
  });

  it("detects when generation services are required", () => {
    assert.equal(generationQueueEnabled({ BULLMQ_WORKERS_ENABLED: "true" }), true);
    assert.equal(generationQueueEnabled({ BULLMQ_WORKERS_ENABLED: "false" }), false);
  });
});

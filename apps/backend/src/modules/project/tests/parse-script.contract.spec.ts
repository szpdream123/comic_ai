import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseScriptCommand } from "../../../../../../packages/contracts/api/project.commands.ts";
import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { operationNames } from "../../../../../../packages/contracts/domain/operation-names.ts";
import {
  createDeterministicParseScriptMockOutput,
  createParseScriptCommandFixture,
  creatorDomainBlockers,
  parseScriptScenarioMatrix,
} from "../project-readiness.ts";

describe("parse script contract", () => {
  it("keeps the B2 command contract aligned with the creator plan", () => {
    assert.equal(parseScriptCommand.operationName, operationNames.scriptParse);
    assert.equal(parseScriptCommand.capability, capabilities.projectEdit);
    assert.equal(parseScriptCommand.idempotencyRequired, true);
    assert.deepEqual(parseScriptCommand.verificationIds, [
      "TC-P0-001",
      "TC-P0-010",
      "IDEMP-003",
    ]);
  });

  it("tracks the durable workflow scenarios B2 must satisfy", () => {
    assert.deepEqual(
      parseScriptScenarioMatrix.map((scenario) => scenario.id),
      [
        "parse-script-starts-workflow",
        "parse-script-replay",
        "parse-script-failure-state",
      ],
    );
  });

  it("provides deterministic parse fixtures for future worker and e2e tests", () => {
    assert.deepEqual(createParseScriptCommandFixture(), {
      projectId: "7de4cc38-16ef-45a9-9e34-5c8cf6f4e530",
      scriptId: "4c4d4c44-bf95-4eb5-bd84-fdf8b6c99dc0",
      idempotencyKey: "parse-script-launch-teaser-v1",
    });

    const mockOutput = createDeterministicParseScriptMockOutput();
    assert.deepEqual(
      mockOutput.episodes.map((episode) => episode.id),
      ["episode-001"],
    );
    assert.deepEqual(
      mockOutput.shots.map((shot) => shot.id),
      ["shot-001", "shot-002", "shot-003"],
    );
  });

  it("keeps A4 workflow dependency visible for parse implementation", () => {
    assert.deepEqual(
      creatorDomainBlockers
        .filter((blocker) => blocker.blocks.includes("B2 ParseScript workflow"))
        .map((blocker) => blocker.id),
      ["a4-workflow-task"],
    );
  });
});

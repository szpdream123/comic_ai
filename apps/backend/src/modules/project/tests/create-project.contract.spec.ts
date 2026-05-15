import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createProjectCommand } from "../../../../../../packages/contracts/api/project.commands.ts";
import { capabilities } from "../../../../../../packages/contracts/domain/capabilities.ts";
import { operationNames } from "../../../../../../packages/contracts/domain/operation-names.ts";
import { projectPhases } from "../../../../../../packages/contracts/domain/states.ts";
import {
  createProjectCommandFixture,
  createProjectScenarioMatrix,
  creatorDomainBlockers,
} from "../project-readiness.ts";

describe("create project contract", () => {
  it("keeps the B1 command contract aligned with the creator plan", () => {
    assert.equal(createProjectCommand.operationName, operationNames.projectCreate);
    assert.equal(createProjectCommand.capability, capabilities.projectCreate);
    assert.equal(createProjectCommand.idempotencyRequired, true);
    assert.deepEqual(createProjectCommand.verificationIds, ["TC-P0-001"]);
    assert.ok(createProjectCommand.businessErrors.includes("invalid_project_input"));
  });

  it("tracks the required B1 delivery scenarios", () => {
    assert.deepEqual(
      createProjectScenarioMatrix.map((scenario) => scenario.id),
      [
        "create-project-success",
        "create-project-invalid-input",
        "create-project-forbidden",
        "create-project-replay",
        "create-project-idempotency-conflict",
      ],
    );
  });

  it("provides a stable fixture for the first project creation flow", () => {
    assert.deepEqual(createProjectCommandFixture(), {
      workspaceId: "4db6f2af-5c44-4ae2-9a8b-7fdc2cc51d1d",
      name: "Launch teaser storyboard",
      scriptInput:
        "Episode 1: The creator opens with a mechanical city skyline and a tense monologue.",
      aspectRatio: "9:16",
      resolution: "1080p",
      idempotencyKey: "create-project-launch-teaser-v1",
    });
    assert.equal(projectPhases.includes("script_input"), true);
  });

  it("keeps platform blockers explicit instead of bypassing them", () => {
    assert.deepEqual(
      creatorDomainBlockers
        .filter((blocker) => blocker.blocks.includes("B1 CreateProject production command"))
        .map((blocker) => blocker.id),
      ["a2-actor-context"],
    );
  });
});

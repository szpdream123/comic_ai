import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { idempotentOperationNames } from "../domain/operation-names.ts";
import { allApiCommandContracts } from "./index.ts";

describe("API command contracts", () => {
  it("declares implementation metadata for every command", () => {
    assert.ok(allApiCommandContracts.length >= 10);

    for (const command of allApiCommandContracts) {
      assert.equal(typeof command.name, "string", command.name);
      assert.equal(typeof command.operationName, "string", command.name);
      assert.equal(typeof command.capability, "string", command.name);
      assert.equal(typeof command.idempotencyRequired, "boolean", command.name);
      assert.ok(command.statePreconditions.length > 0, command.name);
      assert.ok(command.businessErrors.length > 0, command.name);
      assert.ok(command.verificationIds.length > 0, command.name);
    }
  });

  it("marks expensive creator commands as idempotent", () => {
    const expensive = allApiCommandContracts.filter((command) =>
      [
        "ParseScript",
        "SplitShots",
        "GenerateShotImage",
        "GenerateShotVideo",
        "GenerateEpisodeImage",
        "GenerateEpisodeVideo",
        "GenerateCalibration",
        "CreateExport",
      ].includes(command.name),
    );

    assert.ok(expensive.length > 0);
    assert.equal(
      expensive.every((command) => command.idempotencyRequired),
      true,
    );
  });

  it("declares an explicit calibration override command", () => {
    const command = allApiCommandContracts.find(
      (candidate) => candidate.name === "OverrideCalibration",
    );

    assert.ok(command);
    assert.equal(command.operationName, "calibration.override");
    assert.equal(command.idempotencyRequired, true);
    assert.deepEqual(command.requestSchema, {
      calibrationSessionId: "uuid",
      reason: "required text",
    });
    assert.deepEqual(command.responseSchema, {
      calibrationSessionId: "uuid",
      status: "skipped",
      decisionType: "override",
    });
  });

  it("declares membership subscription commands", () => {
    const commandsByName = new Map(
      allApiCommandContracts.map((command) => [command.name, command]),
    );

    const listPlans = commandsByName.get("ListMembershipPlans");
    assert.ok(listPlans);
    assert.equal(listPlans.operationName, "membership.plans.list");
    assert.equal(listPlans.capability, "billing:purchase");
    assert.equal(listPlans.auditEvent, "membership.plans.listed");
    assert.equal(listPlans.idempotencyRequired, false);

    const createOrder = commandsByName.get("CreateMembershipOrder");
    assert.ok(createOrder);
    assert.equal(createOrder.operationName, "membership.order.create");
    assert.equal(createOrder.capability, "billing:purchase");
    assert.equal(createOrder.auditEvent, "membership.order.created");
    assert.equal(createOrder.idempotencyRequired, true);

    const savePlan = commandsByName.get("SaveMembershipPlan");
    assert.ok(savePlan);
    assert.equal(savePlan.operationName, "membership.plan.save");
    assert.equal(savePlan.capability, "admin:billing_config");
    assert.equal(savePlan.auditEvent, "membership.plan.saved");
    assert.equal(savePlan.idempotencyRequired, true);

    const getStatus = commandsByName.get("GetMembershipStatus");
    assert.ok(getStatus);
    assert.equal(getStatus.operationName, "membership.status.get");
    assert.equal(getStatus.capability, "workspace:read");
    assert.equal(getStatus.auditEvent, "membership.status.read");
    assert.equal(getStatus.idempotencyRequired, false);
  });

  it("has a command contract for every exported operation name", () => {
    const contractedOperationNames = new Set(
      allApiCommandContracts.map((command) => command.operationName),
    );

    assert.deepEqual(
      [...idempotentOperationNames].sort(),
      [...contractedOperationNames].sort(),
    );
  });
});

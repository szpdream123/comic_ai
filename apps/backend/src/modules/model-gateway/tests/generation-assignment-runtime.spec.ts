import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { publishReservedGenerationJob } from "../generation-assignment-runtime.ts";

describe("generation assignment runtime", () => {
  it("marks a reserved assignment only after Redis accepts the job", async () => {
    const calls: string[] = [];
    const assignment = await publishReservedGenerationJob({
      async reserve() {
        calls.push("reserve");
        return { assignmentKey: "assignment-1" };
      },
      async publish() { calls.push("publish"); },
      async markPublished() { calls.push("mark"); },
    });

    assert.equal(assignment.assignmentKey, "assignment-1");
    assert.deepEqual(calls, ["reserve", "publish", "mark"]);
  });

  it("keeps a durable publishing reservation when Redis rejects the job", async () => {
    const calls: string[] = [];
    await assert.rejects(publishReservedGenerationJob({
      async reserve() { return { assignmentKey: "assignment-2" }; },
      async publish() {
        calls.push("publish");
        throw new Error("redis unavailable");
      },
      async markPublished() { calls.push("mark"); },
    }), /redis unavailable/);

    assert.deepEqual(calls, ["publish"]);
  });

  it("keeps a Redis-accepted reservation recoverable without retrying when marking fails", async () => {
    let reportedError = "";
    const assignment = await publishReservedGenerationJob({
      async reserve() { return { assignmentKey: "assignment-3" }; },
      async publish() {},
      async markPublished() { throw new Error("database unavailable"); },
      onMarkPublishedError(error) {
        reportedError = error instanceof Error ? error.message : String(error);
      },
    });

    assert.equal(assignment.assignmentKey, "assignment-3");
    assert.equal(reportedError, "database unavailable");
  });
});

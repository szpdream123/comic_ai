import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { processGenerationQueueJobCancellations } from "../generation-queue-cancellation.service.ts";

describe("generation queue job cancellation service", () => {
  it("completes removed jobs and retries transient removal failures", async () => {
    const updates: string[] = [];
    const db = {
      async query(sql: string) {
        if (sql.includes("WITH due AS")) {
          assert.match(sql, /publish_fence_until <= \$1/);
          return {
            rows: [
              { assignment_key: "assignment-ok", queue_name: "queue-a", redis_job_id: "job-ok" },
              { assignment_key: "assignment-busy", queue_name: "queue-b", redis_job_id: "job-busy" },
            ],
          };
        }
        updates.push(sql.includes("status = 'completed'") ? "completed" : "pending");
        return { rows: [] };
      },
    };

    const result = await processGenerationQueueJobCancellations(db as never, {
      now: new Date("2026-07-26T00:00:00.000Z"),
      limit: 10,
      remover: {
        async removeJob(_queueName, jobId) {
          if (jobId === "job-busy") throw new Error("job is locked");
          return "removed";
        },
      },
    });

    assert.deepEqual(result, {
      completedAssignmentKeys: ["assignment-ok"],
      failedAssignmentKeys: ["assignment-busy"],
    });
    assert.deepEqual(updates, ["completed", "pending"]);
  });
});

import assert from "node:assert/strict";
import test from "node:test";
import { agentGenerationQueueConfig } from "../agent-generation-queue.ts";
import { buildGenerationBullMQJob } from "../generation-bullmq.publisher.ts";
import { handleGenerationSubmitImageJob, handleGenerationPollImageJob } from "../generation-bullmq.worker.ts";
import { loadGenerationQueueConfig } from "../generation-queue.config.ts";

test("Agent submit, poll, finalize and inline successors stay off old consumers' queues", async () => {
  const config = loadGenerationQueueConfig({});
  const scope = "a".repeat(32);
  const scoped = agentGenerationQueueConfig(config, scope);
  const payload = { taskId: "task", workflowId: "workflow", mediaType: "image", modelCode: "image", providerExecutor: "gpt-image-2" };
  for (const [eventType, stage] of [["generation.task.created", "submit"], ["generation.task.poll_requested", "poll"], ["generation.task.finalize_requested", "result"]] as const) {
    const event = { id: "event", eventType, payload } as any;
    assert.equal(buildGenerationBullMQJob(event, config).queueName, config.queueNames[stage][0]);
    assert.equal(buildGenerationBullMQJob({ ...event, payload: { ...payload, agentExecutionScope: scope } }, config).queueName, scoped.queueNames[stage][0]);
  }
  const added: string[] = [];
  const input = { job: { data: payload }, config: scoped, publisher: { async add(queue: string) { added.push(queue); } },
    processors: { async submitGptImage() { return { status: "submitted" }; }, async pollGptImage() { return { status: "succeeded" }; } }, now: new Date() } as any;
  await handleGenerationSubmitImageJob(input);
  await handleGenerationPollImageJob({ ...input, job: { data: { ...payload, pollAttempt: 1 } } });
  assert.deepEqual(added, [scoped.queues.poll, scoped.queues.result]);
  assert.throws(() => agentGenerationQueueConfig(config, "malformed"), /invalid_agent_execution_scope/);
});

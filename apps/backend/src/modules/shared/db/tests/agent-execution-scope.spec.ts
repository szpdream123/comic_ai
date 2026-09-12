import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "pg";
import { agentExecutionMetadata, agentExecutionDatabaseUrl } from "../agent-execution-scope.ts";

const env = { WORKER_ENVIRONMENT: "production", REDIS_URL: "redis://user:secret@queue.example:6379/2", BULLMQ_QUEUE_PREFIX: "acceptance" };

test("Agent scope follows queue topology, environment and deployment, not host or rotated credentials", () => {
  const original = agentExecutionMetadata(env).agentExecutionScope;
  assert.equal(original, agentExecutionMetadata({ ...env, HOSTNAME: "different-worker", REDIS_URL: "redis://user:rotated@queue.example/2" }).agentExecutionScope);
  for (const changed of [
    { WORKER_ENVIRONMENT: "local" }, { BULLMQ_QUEUE_PREFIX: "other" },
    { REDIS_URL: "redis://queue.example/3" }, { REDIS_URL: "redis://another.example/2" },
    { CANVAS_AGENT_EXECUTION_SCOPE: "another-deployment" },
  ]) assert.notEqual(original, agentExecutionMetadata({ ...env, ...changed }).agentExecutionScope);
  assert.match(original, /^[a-f0-9]{32}$/);
});

test("pg startup scope survives DATABASE_URL options and preserves configured connection settings", () => {
  const original = "postgres://user:password@db.example:5433/app?sslmode=verify-full&options=-c%20statement_timeout%3D1000";
  const resolved = agentExecutionDatabaseUrl(original, env);
  const client = new Client({ connectionString: resolved });
  const options = (client as any).connectionParameters.options;
  assert.match(options, /statement_timeout=1000/);
  assert.match(options, new RegExp(`comic_ai.agent_execution_scope=${agentExecutionMetadata(env).agentExecutionScope}`));
  const parsed = new URL(resolved);
  assert.equal(parsed.host, "db.example:5433");
  assert.equal(parsed.pathname, "/app");
  assert.equal(parsed.username, "user");
  assert.equal(parsed.password, "password");
  assert.equal(parsed.searchParams.get("sslmode"), "verify-full");
});

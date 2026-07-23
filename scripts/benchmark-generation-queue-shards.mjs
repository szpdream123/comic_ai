import { pathToFileURL } from "node:url";

import { createMigratedTestDb } from "../apps/backend/src/modules/shared/db/test-db.ts";

export const generationQueueLoadScenarios = {
  "60000": { image: 40_000, video: 20_000 },
  "80000": { image: 60_000, video: 20_000 },
};

export async function runGenerationQueueShardBenchmark(input = {}) {
  const scenarioName = String(input.scenario ?? "80000");
  const scenario = generationQueueLoadScenarios[scenarioName];
  if (!scenario) throw new Error(`unknown_generation_load_scenario:${scenarioName}`);
  const db = await createMigratedTestDb();
  const startedAt = Date.now();
  try {
    for (const [mediaType, count] of Object.entries(scenario)) {
      await assignSyntheticTasks(db, {
        scenarioName,
        mediaType,
        count,
        now: new Date(),
      });
    }
    const elapsedMs = Date.now() - startedAt;
    const shards = await db.query(`
      SELECT media_type, count(*)::int AS shard_count,
        max(admitted_count)::int AS maximum_admitted,
        min(rate_limit_max)::int AS minimum_rate_limit,
        max(rate_limit_max)::int AS maximum_rate_limit,
        min(rate_limit_duration_ms)::int AS minimum_rate_duration,
        max(rate_limit_duration_ms)::int AS maximum_rate_duration,
        sum(admitted_count)::int AS assignment_count
      FROM generation_queue_shards
      WHERE stage = 'submit'
      GROUP BY media_type
      ORDER BY media_type
    `);
    const byMedia = Object.fromEntries(shards.rows.map((row) => [row.media_type, row]));
    for (const [mediaType, count] of Object.entries(scenario)) {
      const row = byMedia[mediaType];
      assertMetric(row, `${mediaType}_shards_missing`);
      assertMetric(Number(row.shard_count) === Math.ceil(count / 600), `${mediaType}_shard_count_invalid`);
      assertMetric(Number(row.maximum_admitted) <= 600, `${mediaType}_capacity_exceeded`);
      assertMetric(Number(row.assignment_count) === count, `${mediaType}_assignment_count_invalid`);
      assertMetric(Number(row.minimum_rate_limit) === 5 && Number(row.maximum_rate_limit) === 5, `${mediaType}_rate_limit_invalid`);
      assertMetric(Number(row.minimum_rate_duration) === 1000 && Number(row.maximum_rate_duration) === 1000, `${mediaType}_rate_duration_invalid`);
    }
    const maximumFullShardStartMs = 120_000;
    const projectedPlatformHandoffMs = elapsedMs + maximumFullShardStartMs;
    assertMetric(projectedPlatformHandoffMs <= 10 * 60_000, "generation_platform_handoff_slo_exceeded");
    return {
      scenario: scenarioName,
      tasks: Object.values(scenario).reduce((sum, count) => sum + count, 0),
      assignmentElapsedMs: elapsedMs,
      projectedPlatformHandoffMs,
      shards: shards.rows.map((row) => ({
        mediaType: row.media_type,
        shardCount: Number(row.shard_count),
        maximumAdmitted: Number(row.maximum_admitted),
        assignmentCount: Number(row.assignment_count),
      })),
    };
  } finally {
    await db.close();
  }
}

async function assignSyntheticTasks(db, input) {
  const routeKey = `load:${input.scenarioName}:${input.mediaType}`;
  const routeCode = `l${input.scenarioName}${input.mediaType.slice(0, 1)}`;
  const assignmentPrefix = `load:${input.scenarioName}:${input.mediaType}`;
  for (let start = 1; start <= input.count; start += 600) {
    const end = Math.min(input.count, start + 599);
    await db.query(
      `
        SELECT count(*)
        FROM generate_series($1::int, $2::int) sequence
        CROSS JOIN LATERAL assign_generation_queue_stage(
          $3 || ':' || sequence::text,
          (
            substr(md5($3 || ':' || sequence::text), 1, 8) || '-' ||
            substr(md5($3 || ':' || sequence::text), 9, 4) || '-4' ||
            substr(md5($3 || ':' || sequence::text), 14, 3) || '-8' ||
            substr(md5($3 || ':' || sequence::text), 18, 3) || '-' ||
            substr(md5($3 || ':' || sequence::text), 21, 12)
          )::uuid,
          $4,
          'submit',
          $5,
          $6,
          $7
        ) assignment
      `,
      [start, end, assignmentPrefix, input.mediaType, routeKey, routeCode, input.now],
    );
  }
}

function assertMetric(condition, code) {
  if (!condition) throw new Error(code);
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === invokedPath) {
  const scenario = process.argv.find((argument) => argument.startsWith("--scenario="))?.split("=")[1] ?? "80000";
  const report = await runGenerationQueueShardBenchmark({ scenario });
  console.log(JSON.stringify(report, null, 2));
}

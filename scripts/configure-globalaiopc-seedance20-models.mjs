import { readFile } from "node:fs/promises";

import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const seedSql = await readFile(
  new URL("../packages/db/baseline/model-reference-seed.sql", import.meta.url),
  "utf8",
);
const marker = "-- Source: 0073_globalaiopc_seedance20_discount_special_models.sql";
const endMarker = "-- End Source: 0073_globalaiopc_seedance20_discount_special_models.sql";
const markerIndex = seedSql.indexOf(marker);
const endMarkerIndex = seedSql.indexOf(endMarker, markerIndex);
if (markerIndex < 0 || endMarkerIndex < 0) {
  throw new Error("globalaiopc Seedance 2.0 model seed block is missing");
}
const modelSeedSql = seedSql.slice(markerIndex, endMarkerIndex + endMarker.length);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(modelSeedSql);
  const result = await client.query(`
    SELECT
      model.model_code,
      model.display_name,
      model.provider_model,
      model.provider_protocol,
      model.status,
      model.sort_order,
      model.provider_config_json->>'createTaskEndpoint' AS create_task_endpoint,
      model.pricing_json->>'baseCredits' AS base_credits,
      policy.submit_queue_name,
      policy.poll_queue_name
    FROM ai_model_configs AS model
    LEFT JOIN ai_model_dispatch_policies AS policy ON policy.model_config_id = model.id
    WHERE model.model_code IN (
      'sd_2.0_discount',
      'sd_2.0_discount_with_video_ref',
      'sd_2.0_special',
      'sd_2.0_special_with_video_ref'
    )
    ORDER BY model.sort_order ASC
  `);
  if (result.rows.length !== 4 || result.rows.some((row) => !row.submit_queue_name || !row.poll_queue_name)) {
    throw new Error("globalaiopc Seedance 2.0 model configuration incomplete");
  }
  await client.query("COMMIT");
  console.log(JSON.stringify(result.rows, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

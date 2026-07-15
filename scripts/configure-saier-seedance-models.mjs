import { readFile } from "node:fs/promises";

import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const seedSql = await readFile("packages/db/baseline/model-reference-seed.sql", "utf8");
const marker = "-- Source: 0072_saier_seedance_video_models.sql";
const markerIndex = seedSql.indexOf(marker);
if (markerIndex < 0) {
  throw new Error("saier model seed block is missing");
}
const endMarker = "-- End Source: 0072_saier_seedance_video_models.sql";
const endMarkerIndex = seedSql.indexOf(endMarker, markerIndex);
if (endMarkerIndex < 0) {
  throw new Error("saier model seed end marker is missing");
}
const saierSeedSql = seedSql.slice(markerIndex, endMarkerIndex + endMarker.length);

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query("BEGIN");
  await client.query(saierSeedSql);
  const result = await client.query(`
    SELECT model_code, provider_name, provider_model, provider_protocol, status
    FROM ai_model_configs
    WHERE model_code IN (
      'doubao-seedance-2-0',
      'doubao-seedance-2-0-fast',
      'doubao-seedance-2.0-mini'
    )
    ORDER BY sort_order ASC
  `);
  await client.query("COMMIT");
  console.log(JSON.stringify(result.rows, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

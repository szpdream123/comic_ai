import { readFile } from "node:fs/promises";

import pg from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const seedSql = await readFile("packages/db/baseline/model-reference-seed.sql", "utf8");
const expectedModels = [
  ["doubao-seedance-2-0", "mg-seedance2.0 -{resolution}-15s"],
  ["doubao-seedance-2-0-fast", "mg-seedance2.0 -{resolution} fast-15s"],
  ["doubao-seedance-2.0-mini", "mg-seedance2.0 -{resolution} mini-15s"],
];
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
    WHERE model_code = ANY($1::text[])
    ORDER BY sort_order ASC
  `, [expectedModels.map(([modelCode]) => modelCode)]);
  if (result.rows.length !== expectedModels.length || result.rows.some((row, index) =>
    row.model_code !== expectedModels[index][0] || row.provider_model !== expectedModels[index][1]
  )) {
    throw new Error("saier model configuration is incomplete or provider_model template is invalid");
  }
  await client.query("COMMIT");
  console.log(JSON.stringify(result.rows, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  await client.end();
}

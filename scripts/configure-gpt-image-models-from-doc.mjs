import fs from "node:fs";

import pg from "pg";

const env = loadDotEnv(".env");
const databaseUrl = env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const providerConfig = {
  baseURL: "https://api.wynb.top",
  endpoint: "/v1/images/generations",
  editEndpoint: "https://api.wynb.top/v1/images/edits",
  apiKeyEnv: "GPT_IMAGE2_API_KEY",
  resultFormat: "b64_json",
  requestFormat: "openai_images",
};

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const result = await client.query(
    `
      UPDATE ai_model_configs
      SET provider_name = 'openai',
          provider_protocol = 'openai_images',
          provider_model = 'gpt-image-2',
          provider_config_json = $1::jsonb,
          task_modes_json = CASE
            WHEN model_code = 'gpt-image-2-reference-cn'
              THEN '["image.edit","image.reference_generate","image.image_to_image"]'::jsonb
            ELSE '["image.generate","image.edit","image.reference_generate"]'::jsonb
          END,
          capabilities_json = COALESCE(capabilities_json, '{}'::jsonb)
            || '{"prompt":true,"referenceImages":true,"imageEdit":true,"batch":true}'::jsonb,
          limits_json = COALESCE(limits_json, '{}'::jsonb)
            || '{"maxPromptLength":4000,"maxReferences":8,"maxCount":4,"allowedMimeTypes":["image/jpeg","image/png","image/webp","image/avif"]}'::jsonb,
          ui_config_json = COALESCE(ui_config_json, '{}'::jsonb)
            || jsonb_build_object(
              'providerDocUrl', 'https://code.shoestravel.xin/custom/a99e495b4c5372d7',
              'supportedModes', '["text_to_image","multi_reference","image_to_image"]'::jsonb
            ),
          updated_at = now()
      WHERE model_code IN ('gpt-image-2-cn', 'gpt-image-2-reference-cn')
      RETURNING model_code, provider_config_json
    `,
    [JSON.stringify(providerConfig)],
  );

  console.log(JSON.stringify(result.rows, null, 2));
} finally {
  await client.end();
}

function loadDotEnv(path) {
  const result = {};
  const content = fs.readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

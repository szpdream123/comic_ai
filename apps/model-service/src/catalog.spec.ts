import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlDatabase } from "../../backend/src/modules/shared/db/sql.ts";
import { ModelServiceError } from "./contracts.ts";
import { createModelCatalog } from "./catalog.ts";

function fixture(providerConfig: Record<string, unknown> = {}) {
  const modelRow = {
    id: "model-1", model_code: "model", display_name: "Model", provider_name: "supplier",
    provider_model: "pinned-model", provider_protocol: "openai_compatible_chat", invocation_mode: "sync",
    media_type: "text", task_modes_json: [], capabilities_json: {}, parameter_schema_json: {},
    default_params_json: {}, provider_config_json: providerConfig, pricing_json: {}, limits_json: {},
    ui_config_json: {}, status: "active", sort_order: 1, remark: null,
  };
  const metadata = [{ secret_key: "SUPPLIER_KEY", secret_ref: "secret:one", request_domain: "https://supplier.example/v1", provider_name: "supplier", status: "configured" }];
  const values = new Map([["secret:one", "first-secret"]]);
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const db: SqlDatabase = {
    async query<T>(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      assert.match(sql.trim(), /^SELECT\b/i, "catalog must never write or migrate tables");
      if (/FROM ai_model_configs/i.test(sql)) return { rows: [modelRow] as T[] };
      assert.match(sql, /FROM admin_secret_values/i);
      if (/SELECT\s+secret_value\b/i.test(sql)) {
        assert.match(sql, /secret_ref\s*=\s*\$1/i);
        assert.match(sql, /status\s*=\s*'configured'/i);
        const ref = String(params[0]);
        const enabled = metadata.some(row => row.secret_ref === ref && row.status === "configured");
        return { rows: (enabled && values.has(ref) ? [{ secret_value: values.get(ref) }] : []) as T[] };
      }
      assert.doesNotMatch(sql, /SELECT\s+\*|\bsecret_value\b/i, "listing may read metadata only");
      return { rows: metadata as T[] };
    },
  };
  return { catalog: createModelCatalog(db), metadata, values, queries, modelRow };
}

test("catalog only reads routing metadata, prefers explicit keys, pins refs and removes literal keys", async () => {
  const { catalog, metadata, queries, modelRow } = fixture({ apiKeyEnv: "SUPPLIER_KEY", apiKey: "literal-secret", baseURL: "https://old.example" });
  metadata.push({ ...metadata[0], secret_key: "OTHER", secret_ref: "secret:two", request_domain: "https://old.example" });
  const [model] = await catalog.listModels();
  assert.equal(model.providerConfig.apiKey, undefined);
  assert.equal(model.providerConfig.apiKeyEnv, "SUPPLIER_KEY");
  assert.equal(model.providerConfig.credentialRef, "secret:one");
  assert.equal(model.providerConfig.baseURL, "https://supplier.example/v1");
  assert.equal(modelRow.provider_config_json.apiKey, "literal-secret");
  assert.equal(queries.length, 2);
});

test("an explicit secret ref resolves exactly; absent explicit keys retain environment lookup without guessing", async () => {
  const explicit = fixture({ apiKeyEnv: "secret:one" });
  assert.equal((await explicit.catalog.listModels())[0].providerConfig.credentialRef, "secret:one");
  const absent = fixture({ apiKeyEnv: "ENV_ONLY" });
  const [model] = await absent.catalog.listModels();
  assert.equal(model.providerConfig.credentialRef, undefined);
  assert.equal((await absent.catalog.resolveCredentials(model)).providerConfig.apiKeyEnv, "ENV_ONLY");
  assert.equal(absent.queries.length, 2);
});

test("implicit matches require both provider and endpoint origin and reject ambiguous candidates", async () => {
  const { catalog, metadata } = fixture({ endpoint: "https://supplier.example/v1/chat/completions" });
  metadata.push({ ...metadata[0], secret_key: "OTHER", secret_ref: "secret:two", request_domain: "https://different.example" });
  metadata.push({ ...metadata[0], secret_key: "FOREIGN", secret_ref: "secret:foreign", provider_name: "foreign" });
  assert.equal((await catalog.listModels())[0].providerConfig.credentialRef, "secret:one");
  metadata.push({ ...metadata[0], secret_key: "DUPLICATE", secret_ref: "secret:duplicate" });
  assert.equal((await catalog.listModels())[0].providerConfig.credentialRef, undefined);
});

test("only a unique provider can supply absent routing and a configured mismatched origin cannot fall back", async () => {
  const unique = fixture();
  assert.equal((await unique.catalog.listModels())[0].providerConfig.baseURL, "https://supplier.example/v1");
  unique.metadata.push({ ...unique.metadata[0], secret_key: "OTHER", secret_ref: "secret:two" });
  assert.equal((await unique.catalog.listModels())[0].providerConfig.credentialRef, undefined);
  const mismatch = fixture({ baseURL: "https://mismatch.example" });
  assert.equal((await mismatch.catalog.listModels())[0].providerConfig.credentialRef, undefined);
});

test("credential rotation resolves the pinned ref without changing accepted model or endpoints", async () => {
  const { catalog, metadata, values, queries } = fixture({ apiKeyEnv: "SUPPLIER_KEY", queryTaskEndpoint: "/tasks/{id}" });
  const [snapshot] = await catalog.listModels();
  metadata[0].request_domain = "https://new-routing.example";
  values.set("secret:one", "rotated-secret");
  const resolved = await catalog.resolveCredentials(snapshot);
  assert.equal(resolved.providerConfig.apiKey, "rotated-secret");
  assert.equal(resolved.providerConfig.baseURL, "https://supplier.example/v1");
  assert.equal(resolved.providerConfig.queryTaskEndpoint, "/tasks/{id}");
  assert.equal(snapshot.providerConfig.apiKey, undefined);
  assert.equal(resolved.providerModel, "pinned-model");
  assert.deepEqual(queries.at(-1)?.params, ["secret:one"]);
  assert.doesNotMatch(queries.at(-1)!.sql, /request_domain|secret_key/);
});

test("a revoked pinned credential fails closed rather than using another key or environment fallback", async () => {
  const { catalog, metadata } = fixture({ apiKeyEnv: "SUPPLIER_KEY" });
  const [snapshot] = await catalog.listModels();
  metadata[0].status = "missing";
  await assert.rejects(catalog.resolveCredentials(snapshot),
    (error) => error instanceof ModelServiceError && error.code === "provider_credentials_unavailable");
});
test("new requests retain a revoked explicit admin reference instead of using a stale environment key", async () => {
  const { catalog, metadata } = fixture({ apiKeyEnv: "SUPPLIER_KEY" });
  metadata[0].status = "missing";
  const [model] = await catalog.listModels();
  assert.equal(model.providerConfig.credentialRef, "secret:one");
  await assert.rejects(catalog.resolveCredentials(model),
    (error) => error instanceof ModelServiceError && error.code === "provider_credentials_unavailable");
});

test("explicit secret keys take precedence over colliding references without bypassing revocation", async () => {
  const { catalog, metadata } = fixture({ apiKeyEnv: "SUPPLIER_KEY" });
  metadata[0].status = "missing";
  metadata.push({ ...metadata[0], secret_key: "OTHER", secret_ref: "SUPPLIER_KEY", status: "configured" });
  const [model] = await catalog.listModels();
  assert.equal(model.providerConfig.credentialRef, "secret:one");
  await assert.rejects(catalog.resolveCredentials(model),
    (error) => error instanceof ModelServiceError && error.code === "provider_credentials_unavailable");
});

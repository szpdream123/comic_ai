import { listActiveAiModelConfigs } from "../../backend/src/modules/model-catalog/ai-model-config.store.ts";
import type { SqlDatabase } from "../../backend/src/modules/shared/db/sql.ts";
import { ModelServiceError, type ModelConfig } from "./contracts.ts";

interface CredentialMetadata {
  secret_key: string;
  secret_ref: string;
  request_domain: string | null;
  provider_name: string | null;
  status: string;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function origin(value: string): string {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.origin : "";
  } catch {
    return "";
  }
}

function chooseCredential(model: ModelConfig, rows: CredentialMetadata[]): CredentialMetadata | undefined {
  const explicitKey = text(model.providerConfig.apiKeyEnv);
  const configured = rows.filter(row => row.status === "configured");
  if (explicitKey) {
    // An explicit environment key/ref must not silently switch provider accounts.
    // Keep revoked matches pinned: only truly absent references may use an environment key.
    // Match the admin resolver's key-before-reference precedence across the two unique namespaces.
    return rows.find(row => row.secret_key === explicitKey) ?? rows.find(row => row.secret_ref === explicitKey);
  }
  const provider = text(model.providerName);
  if (!provider) return undefined;
  const endpoint = text(model.providerConfig.baseURL) ||
    ["endpoint", "requestPath", "createTaskEndpoint", "queryTaskEndpoint"]
      .map(key => text(model.providerConfig[key])).find(value => /^https?:\/\//i.test(value)) || "";
  const endpointOrigin = origin(endpoint);
  const matches = configured.filter(row => row.provider_name === provider &&
    (!endpoint || (endpointOrigin !== "" && origin(text(row.request_domain)) === endpointOrigin)));
  return matches.length === 1 ? matches[0] : undefined;
}

/** Read-only adapter: the existing admin catalog owns routing and credentials. */
export function createModelCatalog(db: SqlDatabase): {
  listModels(): Promise<ModelConfig[]>;
  resolveCredentials(model: ModelConfig): Promise<ModelConfig>;
} {
  return {
    async listModels() {
      const models = await listActiveAiModelConfigs(db);
      const { rows } = await db.query<CredentialMetadata>(`
        SELECT secret_key, secret_ref, request_domain, provider_name, status
        FROM admin_secret_values
      `);
      return models.map(model => {
        const credential = chooseCredential(model, rows);
        const providerConfig = { ...model.providerConfig };
        delete providerConfig.apiKey;
        delete providerConfig.credentialRef;
        if (credential) {
          providerConfig.credentialRef = credential.secret_ref;
          const requestDomain = text(credential.request_domain);
          if (requestDomain) providerConfig.baseURL = requestDomain;
        }
        return { ...model, providerConfig };
      });
    },

    async resolveCredentials(model) {
      const providerConfig = { ...model.providerConfig };
      delete providerConfig.apiKey;
      const credentialRef = text(providerConfig.credentialRef);
      if (!credentialRef) return { ...model, providerConfig };
      // Read only the pinned identity's current secret. Routing belongs to the
      // accepted snapshot even if the admin edits request_domain while polling.
      const { rows } = await db.query<{ secret_value: string | null }>(`
        SELECT secret_value FROM admin_secret_values
        WHERE secret_ref = $1 AND status = 'configured'
      `, [credentialRef]);
      const secret = rows.length === 1 ? text(rows[0].secret_value) : "";
      if (!secret) throw new ModelServiceError(503, "provider_credentials_unavailable");
      providerConfig.apiKey = secret;
      return { ...model, providerConfig };
    },
  };
}

import type { MarketingSourceAdapter, MarketingSourceManifest } from "../ports/marketing-source.ts";

export class ExternalMarketingSourceAdapter implements MarketingSourceAdapter {
  async toManifest(input: unknown): Promise<MarketingSourceManifest> {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("marketing_external_source_invalid");
    const source = input as Record<string, unknown>;
    const namespace = typeof source.namespace === "string" ? source.namespace.trim() : "";
    const recordId = typeof source.recordId === "string" ? source.recordId.trim() : "";
    const version = typeof source.version === "string" ? source.version.trim() : "";
    if (!namespace || !recordId || !version) throw new Error("marketing_external_source_identity_required");
    const authorizationStatus = source.authorizationStatus;
    if (authorizationStatus !== "owned" && authorizationStatus !== "authorized") {
      throw new Error("marketing_external_source_authorization_required");
    }
    return {
      namespace,
      recordId,
      version,
      snapshot: structuredClone(source),
      authorizationStatus,
      ...(typeof source.sourceUrl === "string" ? { sourceUrl: source.sourceUrl } : {}),
      ...(typeof source.contentHash === "string" ? { contentHash: source.contentHash } : {}),
    };
  }
}

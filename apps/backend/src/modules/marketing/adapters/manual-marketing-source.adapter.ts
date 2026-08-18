import type { MarketingSourceAdapter, MarketingSourceManifest } from "../ports/marketing-source.ts";

export class ManualMarketingSourceAdapter implements MarketingSourceAdapter {
  async toManifest(input: unknown): Promise<MarketingSourceManifest> {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("marketing_manual_source_invalid");
    }
    const source = input as Record<string, unknown>;
    if (typeof source.recordId !== "string" || !source.recordId || typeof source.version !== "string" || !source.version) {
      throw new Error("marketing_manual_source_identity_required");
    }
    return {
      namespace: "manual",
      recordId: source.recordId,
      version: source.version,
      snapshot: structuredClone(source),
      authorizationStatus: source.authorizationStatus === "owned" || source.authorizationStatus === "authorized"
        ? source.authorizationStatus
        : "unknown",
    };
  }
}

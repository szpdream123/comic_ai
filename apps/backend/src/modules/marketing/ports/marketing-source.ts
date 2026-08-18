export type MarketingSourceManifest = {
  namespace: string;
  recordId: string;
  version: string;
  snapshot: Record<string, unknown>;
  authorizationStatus: "owned" | "authorized" | "unknown" | "revoked";
  sourceUrl?: string;
  contentHash?: string;
};

export interface MarketingSourceAdapter {
  toManifest(input: unknown): Promise<MarketingSourceManifest>;
}

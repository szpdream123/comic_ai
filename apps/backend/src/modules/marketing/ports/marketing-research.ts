export type MarketingResearchDocument = {
  requestedUrl: string;
  canonicalUrl: string;
  title: string;
  contentType: string;
  text: string;
  untrusted: true;
};

export interface MarketingResearchProvider {
  collect(input: { urls: string[] }): Promise<MarketingResearchDocument[]>;
}

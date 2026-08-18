export const MARKETING_AGENT_STAGES = ["research", "strategy", "copy", "media", "compliance"] as const;

export type MarketingAgentStage = typeof MARKETING_AGENT_STAGES[number];
export type MarketingAgentDataClassification = "public" | "internal" | "restricted";
export type MarketingAgentJson = Record<string, unknown> | unknown[];

export type MarketingAgentKnowledgeSegment = {
  id: string;
  documentId: string;
  content: string;
  summary: string;
  sourceUrl: string | null;
};

export type MarketingAgentProviderApproval = {
  approved: true;
  approvalReference: string;
  dataClassifications: readonly MarketingAgentDataClassification[];
  allowedInputPaths: readonly string[];
};

export type MarketingAgentStageRequest = {
  runId: string;
  campaignId: string;
  createdByAdminId: string;
  stage: MarketingAgentStage;
  dataClassification: MarketingAgentDataClassification;
  input: MarketingAgentJson;
  systemRules: readonly string[];
};

export type MarketingAgentStageResult = {
  output: MarketingAgentJson;
  sourceIds?: string[];
  knowledgeSegmentIds?: string[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    mediaSeconds?: number;
    estimatedCost?: number;
  };
};

export interface MarketingAgentStageProvider {
  readonly stage: MarketingAgentStage;
  readonly name: string;
  readonly modelVersion?: string;
  readonly execution: "local" | "external";
  readonly approval?: MarketingAgentProviderApproval;
  execute(request: MarketingAgentStageRequest): Promise<MarketingAgentStageResult>;
}

export type ClaimedMarketingAgentStep = {
  stepId: string;
  executionToken: string;
  runId: string;
  campaignId: string;
  createdByAdminId: string;
  stage: MarketingAgentStage;
  dataClassification: MarketingAgentDataClassification;
  runInput: MarketingAgentJson;
  knowledgeSegmentIds: string[];
};

export interface MarketingAgentRunStore {
  claimNext(input: { now: Date; staleBefore: Date; executionToken: string }): Promise<ClaimedMarketingAgentStep | null>;
  listSucceededOutputs(runId: string): Promise<Partial<Record<MarketingAgentStage, MarketingAgentJson>>>;
  loadApprovedKnowledgeSegments(ids: string[], campaignId: string): Promise<MarketingAgentKnowledgeSegment[]>;
  recordStepInput(input: { stepId: string; executionToken: string; inputSummary: string; providerName: string }): Promise<boolean>;
  recordExternalization(input: {
    runId: string;
    campaignId: string;
    stage: MarketingAgentStage;
    providerName: string;
    dataClassification: MarketingAgentDataClassification;
    contentSha256: string;
    approvalReference: string;
    allowedInputPaths: string[];
  }): Promise<void>;
  completeStep(input: {
    stepId: string;
    executionToken: string;
    stage: MarketingAgentStage;
    output: MarketingAgentJson;
    sourceIds: string[];
    knowledgeSegmentIds: string[];
    finishedAt: Date;
  }): Promise<boolean>;
  requireManualReview(input: {
    stepId: string;
    executionToken: string;
    errorCode: string;
    detail: MarketingAgentJson;
    finishedAt: Date;
  }): Promise<boolean>;
  failStep(input: {
    stepId: string;
    executionToken: string;
    errorCode: string;
    finishedAt: Date;
  }): Promise<boolean>;
}
